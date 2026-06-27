export const CSGO_BOTPROFILE_TEMPLATE = String.raw`//----------------------------------------------------------------------------
// BotProfile.db
// Author: Michael S. Booth, Turtle Rock Studios (www.turtlerockstudios.com)
//
// This database defines bot "personalities".
// LPJ owns this canonical template and regenerates the live server copy before
// every match so local botprofile.db edits cannot alter bot stats.
//


//----------------------------------------------------------------------------

//
// All profiles begin with this data and overwrite their own
//
Default
	Skill = 50
	Aggression = 50
	ReactionTime = 0.3
	AttackDelay = 0
	Teamwork = 75
	AimFocusInitial = 20			// initial focus spread in degrees (from desired center)
	AimFocusDecay = 0.7				// how much focus shrinks per second (.25 = 25% of size after 1 sec)
	AimFocusOffsetScale = 0.30		// controls accuracy when tracking to target (0 == perfect, should always be < 1)
	AimfocusInterval = 0.8			// how often focus is adjusted (smaller intervals means better movement tracking)
	WeaponPreference = none
	Cost = 0
	Difficulty = NORMAL
	VoicePitch = 100
	Skin = 0
	LookAngleMaxAccelNormal = 5500.0
		LookAngleStiffnessNormal = 1150.0
		LookAngleDampingNormal = 110.0
		LookAngleMaxAccelAttacking = 5500.0
		LookAngleStiffnessAttacking = 1150.0
		LookAngleDampingAttacking = 50.0
End

//----------------------------------------------------------------------------

//
// These templates inherit from Default and override with their values
// The name of the template defines a type that is used by individual bot profiles
//

// personality templates
// stats added as a separate template since it would get overwritten by difficulty template
//

Template ASniperPersonality
	Teamwork = 75
	Aggression = 75
End

Template PSniperPersonality
	Teamwork = 95
	Aggression = 40
End

Template SniperPersonality
	Teamwork = 85
	Aggression = 60
End

Template RiflePersonality
	Teamwork = 85
	Aggression = 70
End

Template ARiflePersonality
	Teamwork = 95
	Aggression = 85
End

Template PRiflePersonality
	Teamwork = 85
	Aggression = 40
End

Template EntryPersonality
	Teamwork = 100
	Aggression = 95
End

Template LurkPersonality
	Teamwork = 25
	Aggression = 35
End

Template ALurkPersonality
	Teamwork = 25
	Aggression = 50
End

Template PLurkPersonality
	Teamwork = 25
	Aggression = 20
End

// weapon preference templates
Template Rifle
	    WeaponPreference = ak47
	    WeaponPreference = m4a1_silencer
		WeaponPreference = m4a1
		WeaponPreference = galilar
		WeaponPreference = famas
		WeaponPreference = mp9
		WeaponPreference = mac10
		WeaponPreference = ump45
		WeaponPreference = mp7
End

Template Sniper
		WeaponPreference = awp
		WeaponPreference = ak47
		WeaponPreference = m4a1_silencer
		WeaponPreference = m4a1
		WeaponPreference = galilar
		WeaponPreference = famas
		WeaponPreference = ssg08
		WeaponPreference = mp9
		WeaponPreference = mac10
		WeaponPreference = ump45
		WeaponPreference = mp7
End


// skill templates
Template Star // 1.25+ 
		Skill = 100
		Rank = 1800
		ReactionTime = 0.001
		Cost = 4
		Difficulty = EXPERT
		VoicePitch = 85
		AimFocusInitial = 0.001
		AimFocusDecay = 0.001
		AimFocusOffsetScale = 0.001
		AimfocusInterval = 0.001
End

Template Fragger // 1.18 - 1.24
	Skill = 100
	Rank = 1800
	ReactionTime = 0.01
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.01
	AimFocusDecay = 0.01
	AimFocusOffsetScale = 0.01
	AimfocusInterval = 0.01
End

Template Solid // 1.14 - 1.17
	Skill = 100
	Rank = 1800
	ReactionTime = 0.06
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.06
	AimFocusDecay = 0.06
	AimFocusOffsetScale = 0.06
	AimfocusInterval = 0.06
End

Template Medium // 1.11 - 1.13
	Skill = 100
	Rank = 1800
	ReactionTime = 0.1
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.1
	AimFocusDecay = 0.1
	AimFocusOffsetScale = 0.1
	AimfocusInterval = 0.1
End

Template Avg // 1.06 - 1.10
	Skill = 100
	Rank = 1800
	ReactionTime = 0.1
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.12
	AimFocusDecay = 0.12
	AimFocusOffsetScale = 0.12
	AimfocusInterval = 0.12
End

Template Low // 1.00 - 1.05
	Skill = 100
	Rank = 1800
	ReactionTime = 0.13
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.13
	AimFocusDecay = 0.13
	AimFocusOffsetScale = 0.13
	AimfocusInterval = 0.13
End

Template Bad // 0.95 - 0.99
	Skill = 100
	Rank = 1800
	ReactionTime = 0.15
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.15
	AimFocusDecay = 0.15
	AimFocusOffsetScale = 0.15
	AimfocusInterval = 0.15
End

Template Poor // 0.95 - 0.99
	Skill = 100
	Rank = 1800
	ReactionTime = 0.15
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.15
	AimFocusDecay = 0.15
	AimFocusOffsetScale = 0.15
	AimfocusInterval = 0.15
End

Template ReallyBad // Less than 0.94
	Skill = 100
	Rank = 1800
	ReactionTime = 0.15
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.15
	AimFocusDecay = 0.15
	AimFocusOffsetScale = 0.15
	AimfocusInterval = 0.15
End

Template Worse
	Skill = 100
	Rank = 1800
	ReactionTime = 0.15
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.15
	AimFocusDecay = 0.15
	AimFocusOffsetScale = 0.15
	AimfocusInterval = 0.15
End

Template NotGood
	Skill = 100
	Rank = 1800
	ReactionTime = 0.15
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.15
	AimFocusDecay = 0.15
	AimFocusOffsetScale = 0.15
	AimfocusInterval = 0.15
End

Template Abysmal
	Skill = 100
	Rank = 1800
	ReactionTime = 0.15
	Cost = 4
	Difficulty = EXPERT
	VoicePitch = 85
	AimFocusInitial = 0.15
	AimFocusDecay = 0.15
	AimFocusOffsetScale = 0.15
	AimfocusInterval = 0.15
End

//----------------------------------------------------------------------------
//
// These are the individual bot profiles, which inherit first from
// Default and then the specified Template(s), in order
//


{{@each( it.home ) => player}}
{{player}}
{{/each}}


//----------------------------------------

{{@each( it.away ) => player}}
{{player}}
{{/each}}
`;
