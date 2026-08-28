import { NextRequest, NextResponse } from "next/server";
import { advanceLeagueMatchday } from "@/lib/league/weekend-scheduler";

export async function POST(request: NextRequest) {
  try {
    const { leagueId } = await request.json();
    if (!leagueId) return NextResponse.json({ error: "Missing leagueId" }, { status: 400 });
    
    const result = await advanceLeagueMatchday(leagueId);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
