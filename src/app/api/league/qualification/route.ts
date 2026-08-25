import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — Return the qualification checklist for a player + league
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'You must be logged in' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const leagueId = searchParams.get('leagueId');

    // Get player profile with all verification fields
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, username, display_name, full_name, country, gender, rating, phone_number, phone_verified, identity_verified, chesscom_verified, games_played, created_at, account_created_at')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    // Get membership status
    const { data: membership } = await admin
      .from('memberships')
      .select('*')
      .eq('player_id', user.id)
      .eq('status', 'active')
      .gt('end_date', new Date().toISOString())
      .limit(1)
      .single();

    // If leagueId provided, check specific league requirements
    let leagueRequirements: any = null;
    let leagueChecklist: any = null;

    if (leagueId) {
      const { data: league } = await admin
        .from('premier_leagues')
        .select('*')
        .eq('id', leagueId)
        .single();

      if (league) {
        const accountAge = Math.floor(
          (Date.now() - new Date(profile.account_created_at || profile.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24)
        );

        leagueRequirements = {
          requiresPhoneVerification: league.requires_phone_verification,
          requiresIdentityVerification: league.requires_identity_verification,
          requiresChesscomVerification: league.requires_chesscom_verification,
          minGamesPlayed: league.min_games_played || 0,
          minAccountAgeDays: league.min_account_age_days || 0,
          entryType: league.entry_type || 'free',
          genderRestriction: league.gender_restriction || 'open',
          minRating: league.min_rating || 0,
          maxRating: league.max_rating,
          tier: league.tier || 1,
        };

        // Build checklist
        const checklist = [
          {
            id: 'profile_complete',
            label: 'Complete your profile',
            description: 'Set your full name, display name, and country',
            done: !!(profile.full_name && profile.display_name && profile.country),
            required: true,
            action: '/settings',
            actionLabel: 'Edit Profile',
          },
          {
            id: 'gender_selected',
            label: 'Select your gender',
            description: 'Required for men\'s and women\'s division eligibility',
            done: !!profile.gender,
            required: true,
            action: '/settings',
            actionLabel: 'Set Gender',
          },
          {
            id: 'gender_requirement',
            label: `Meets gender requirement (${league.gender_restriction || 'open'})`,
            description: league.gender_restriction === 'male'
              ? 'This is a men\'s division — your gender must be set to male'
              : league.gender_restriction === 'female'
                ? 'This is a women\'s division — your gender must be set to female'
                : 'This is an open division — all genders welcome',
            done: league.gender_restriction === 'open' || profile.gender === league.gender_restriction,
            required: league.gender_restriction !== 'open',
            action: '/settings',
            actionLabel: 'Update Gender',
          },
          {
            id: 'phone_verified',
            label: 'Verify your phone number',
            description: 'We send a verification code via SMS to confirm your identity',
            done: league.requires_phone_verification ? !!profile.phone_verified : true,
            required: league.requires_phone_verification,
            action: '/settings',
            actionLabel: 'Verify Phone',
          },
          {
            id: 'identity_verified',
            label: 'Complete identity verification',
            description: 'Verify your identity with a national ID or other government document',
            done: league.requires_identity_verification ? !!profile.identity_verified : true,
            required: league.requires_identity_verification,
            action: '/settings',
            actionLabel: 'Verify Identity',
          },
          {
            id: 'chesscom_linked',
            label: 'Link your Chess.com account',
            description: 'Connect your Chess.com profile to import your verified rating',
            done: league.requires_chesscom_verification ? !!profile.chesscom_verified : true,
            required: league.requires_chesscom_verification,
            action: '/settings',
            actionLabel: 'Link Chess.com',
          },
          {
            id: 'min_games',
            label: `Play at least ${league.min_games_played || 0} games`,
            description: `You have played ${profile.games_played || 0} game(s) so far`,
            done: (profile.games_played || 0) >= (league.min_games_played || 0),
            required: (league.min_games_played || 0) > 0,
            action: '/play',
            actionLabel: 'Play Now',
          },
          {
            id: 'account_age',
            label: `Account at least ${league.min_account_age_days || 0} days old`,
            description: `Your account is ${accountAge} day(s) old`,
            done: accountAge >= (league.min_account_age_days || 0),
            required: (league.min_account_age_days || 0) > 0,
            action: null,
            actionLabel: null,
          },
          {
            id: 'rating',
            label: league.maxRating
              ? `Rating between ${league.min_rating || 0} and ${league.max_rating}`
              : `Minimum rating of ${league.min_rating || 0}`,
            description: `Your current rating is ${profile.rating || 0}`,
            done: (profile.rating || 0) >= (league.min_rating || 0) && (!league.max_rating || (profile.rating || 0) <= league.max_rating),
            required: (league.min_rating || 0) > 0 || !!league.max_rating,
            action: '/play',
            actionLabel: 'Play Rated Games',
          },
          {
            id: 'membership',
            label: 'Active CrazyChess Club membership',
            description: league.entry_type === 'membership'
              ? 'This competition requires an active membership (MK10,000/month)'
              : 'No membership required for this competition',
            done: league.entry_type === 'membership' ? !!membership : true,
            required: league.entry_type === 'membership',
            action: '/league/subscribe',
            actionLabel: 'Get Membership',
          },
        ];

        leagueChecklist = {
          items: checklist,
          completedCount: checklist.filter(c => c.done).length,
          requiredCount: checklist.filter(c => c.required).length,
          allDone: checklist.filter(c => c.required).every(c => c.done),
        };
      }
    }

    // Build general qualification status (not league-specific)
    const generalChecklist = [
      {
        id: 'profile_complete',
        label: 'Complete your profile',
        description: 'Set your full name, display name, and country',
        done: !!(profile.full_name && profile.display_name && profile.country),
      },
      {
        id: 'gender_selected',
        label: 'Select your gender',
        description: 'Required for men\'s and women\'s division eligibility',
        done: !!profile.gender,
      },
      {
        id: 'phone_verified',
        label: 'Verify your phone number',
        description: 'Phone verification for identity confirmation',
        done: !!profile.phone_verified,
      },
      {
        id: 'identity_verified',
        label: 'Complete identity verification',
        description: 'Government ID or document verification',
        done: !!profile.identity_verified,
      },
      {
        id: 'chesscom_linked',
        label: 'Link your Chess.com account',
        description: 'Import your verified chess rating',
        done: !!profile.chesscom_verified,
      },
      {
        id: 'membership',
        label: 'Active CrazyChess Club membership',
        description: 'Required for premium competitions',
        done: !!membership,
      },
    ];

    return NextResponse.json({
      success: true,
      profile: {
        id: profile.id,
        username: profile.username,
        display_name: profile.display_name,
        full_name: profile.full_name,
        country: profile.country,
        gender: profile.gender,
        rating: profile.rating,
        phone_verified: profile.phone_verified,
        identity_verified: profile.identity_verified,
        chesscom_verified: profile.chesscom_verified,
        games_played: profile.games_played || 0,
      },
      membership: membership ? {
        status: 'active',
        end_date: membership.end_date,
        billing_cycle: membership.billing_cycle,
      } : null,
      generalChecklist: {
        items: generalChecklist,
        completedCount: generalChecklist.filter(c => c.done).length,
        totalCount: generalChecklist.length,
        allDone: generalChecklist.every(c => c.done),
      },
      leagueChecklist,
      leagueRequirements,
    });
  } catch (error: any) {
    console.error('Qualification API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
