import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/kyc/submit  (multipart form)
 *   docType: national_id | passport | drivers_license
 *   docNumber: government ID number
 *   docFile: image of the document
 *   selfieFile: selfie holding the document
 *
 * Compliance upgrade promised to PawaPay (2026-09-15 call): document-level
 * KYC on top of the minimal signup KYC. Files go to the PRIVATE
 * kyc-documents bucket (own-folder insert policy); an admin reviews and
 * approves/rejects in Admin → Verification. One pending submission at a
 * time; a rejected player may resubmit.
 */
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const form = await req.formData();
    const docType = String(form.get("docType") || "");
    const docNumber = String(form.get("docNumber") || "").trim();
    const docFile = form.get("docFile") as File | null;
    const selfieFile = form.get("selfieFile") as File | null;

    if (!["national_id", "passport", "drivers_license"].includes(docType)) {
      return NextResponse.json({ error: "Choose a valid document type" }, { status: 400 });
    }
    if (docNumber.length < 4) {
      return NextResponse.json({ error: "Enter your document number" }, { status: 400 });
    }
    if (!docFile || !selfieFile) {
      return NextResponse.json({ error: "Upload both your ID document and a selfie" }, { status: 400 });
    }
    for (const f of [docFile, selfieFile]) {
      if (f.size > MAX_BYTES) return NextResponse.json({ error: "Images must be under 5MB" }, { status: 400 });
      if (!f.type.startsWith("image/")) return NextResponse.json({ error: "Images only (JPG or PNG)" }, { status: 400 });
    }

    // One pending review at a time; re-submission allowed after a rejection
    const { data: existing } = await supabase
      .from("kyc_submissions")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "You already have a submission under review" }, { status: 409 });
    }

    const ext = (name: string) => (name.toLowerCase().endsWith(".png") ? "png" : "jpg");
    const ts = Date.now();
    const docPath = `${user.id}/doc_${ts}.${ext(docFile.name)}`;
    const selfiePath = `${user.id}/selfie_${ts}.${ext(selfieFile.name)}`;

    const up1 = await supabase.storage.from("kyc-documents").upload(docPath, Buffer.from(await docFile.arrayBuffer()), {
      contentType: docFile.type,
    });
    if (up1.error) return NextResponse.json({ error: "Couldn't upload your document. Try again." }, { status: 500 });

    const up2 = await supabase.storage.from("kyc-documents").upload(selfiePath, Buffer.from(await selfieFile.arrayBuffer()), {
      contentType: selfieFile.type,
    });
    if (up2.error) {
      await supabase.storage.from("kyc-documents").remove([docPath]);
      return NextResponse.json({ error: "Couldn't upload your selfie. Try again." }, { status: 500 });
    }

    const { error: insertError } = await supabase.from("kyc_submissions").insert({
      user_id: user.id,
      doc_type: docType,
      doc_number: docNumber,
      doc_path: docPath,
      selfie_path: selfiePath,
      status: "pending",
    });
    if (insertError) {
      await supabase.storage.from("kyc-documents").remove([docPath, selfiePath]);
      return NextResponse.json({ error: insertError.message || "Couldn't record your submission" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: "pending" });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Something went wrong" }, { status: 500 });
  }
}
