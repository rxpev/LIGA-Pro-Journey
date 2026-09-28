const TRIAL_INFORMATION_BUTTON = `<button className="trial-information-button" data-trial-information="true" data-transfer-id="{{it.transfer.id}}" data-team-name="{{it.transfer.from.name}}" data-team-blazon="{{it.transfer.from.blazon}}" data-series="{{it.trialSeries}}" data-goal-type="{{it.trialGoal.type}}" data-goal-value="{{it.trialGoal.value}}" data-replaced-player="{{it.replacedPlayer.name}}">Trial Information</button>`;

const TRIAL_BAND_INTROS: Record<string, string> = {
  poor: `Hello, {{it.profile.player.name}}.

We at **{{it.transfer.from.name}}** have been looking at your recent FACEIT performances and think you’ve shown enough to be worth taking a closer look at. We would like to invite you for a trial.`,
  adequate: `Hello, {{it.profile.player.name}}.

We at **{{it.transfer.from.name}}** have been following your recent FACEIT performances and have been pleased with what we’ve seen. We think you may be a good fit for the team and would like to invite you for a trial.`,
  good: `Hello, {{it.profile.player.name}}.

We at **{{it.transfer.from.name}}** have been impressed by your recent FACEIT performances. You’ve caught our attention, and we believe you could be a good fit for the team. We would like to invite you for a trial.`,
  excellent: `Hello, {{it.profile.player.name}}.

We at **{{it.transfer.from.name}}** have been very impressed by your recent FACEIT performances. You’ve consistently stood out to us, and we believe you could be an excellent fit for the team. We would like to invite you for a trial.`,
  absurd: `Hello, {{it.profile.player.name}}.

We at **{{it.transfer.from.name}}** have been extremely impressed by your recent FACEIT performances. The level you’ve been showing has really stood out, and we’re very excited to see how you perform in a team environment. We would love to invite you for a trial.`,
};

export function getTrialIncomingContent(band: string) {
  const intro = TRIAL_BAND_INTROS[band] ?? TRIAL_BAND_INTROS.poor;
  return `${intro}

For the trial period, you will be replacing **{{it.replacedPlayer.name}}**.

I have attached the trial terms to this message.

${TRIAL_INFORMATION_BUTTON}`;
}

const TRIAL_ACCEPTED_RESPONSES: Record<string, string> = {
  poor: `That’s what the trial is for. Show me what you can do, and I’ll take it from there. If you reach the performance goal, we can start talking about putting a contract together.`,
  adequate: `Good attitude. I’m interested to see how you perform with the team. If you hit the performance goal, we can start working toward a contract.`,
  good: `That’s good to hear. Your FACEIT performances have already made a strong impression on me, so I’m looking forward to seeing how you do with the team. If you reach the performance goal, we can get started on putting a contract together.`,
  excellent: `Glad to hear it. I’ve been very impressed by your FACEIT performances, and I’m excited to see whether you can bring that same level into the team. Reach the performance goal, and we can start working on your contract.`,
  absurd: `You’ve already made a huge impression on me with your FACEIT performances. If you can bring that level into the team and reach the performance goal, I’ll be more than happy to start putting a contract together.`,
};

const TRIAL_REJECTED_RESPONSES: Record<string, string> = {
  poor: `Understood. Thanks for letting me know. I wish you the best of luck with your next steps.`,
  adequate: `No problem, I understand. I was interested to see how you would do with the team. Best of luck with whatever comes next.`,
  good: `That’s a shame, but I understand. Your FACEIT performances made a strong impression on me. I wish you all the best moving forward.`,
  excellent: `I’m disappointed to hear that, but I respect your decision. I’ve been very impressed by your FACEIT performances and thought you could have been a strong fit. Best of luck with your future opportunities.`,
  absurd: `That’s unfortunate. Your FACEIT performances really impressed me, and I was interested to see how you’d perform with the team. I respect the decision and wish you the best going forward.`,
};

export function getTrialCoachResponse(band: string | null | undefined, accepted: boolean) {
  const responses = accepted ? TRIAL_ACCEPTED_RESPONSES : TRIAL_REJECTED_RESPONSES;
  return responses[band ?? ''] ?? responses.poor;
}

const LATE_TRIAL_ACCEPTED_RESPONSES: Record<string, string> = {
  poor: `No problem. The offer is still available, so we can move forward with the trial.`,
  adequate: `No worries about the late reply. I’m glad you accepted, and we can go ahead with the trial.`,
  good: `No problem at all. I’m glad you accepted and I’m looking forward to seeing how you do during the trial.`,
  excellent: `No worries about the delay. I’m very glad you accepted and I’m looking forward to getting the trial started.`,
  absurd: `No problem about the late reply. I’m really glad you accepted. I’ve been looking forward to getting you into the team, so let’s get the trial started.`,
};

const LATE_TRIAL_REJECTED_RESPONSES: Record<string, string> = {
  poor: `Thanks for getting back to me. No worries about the late reply, and I understand your decision. Best of luck going forward.`,
  adequate: `Thanks for letting me know, and no problem about the delayed response. I understand your decision and wish you the best going forward.`,
  good: `Thanks for getting back to me. I appreciate you letting me know. I understand your decision and wish you the best.`,
  excellent: `Thanks for getting back to me. No worries about the late response. It’s unfortunate you won’t be joining us for the trial, but I respect your decision. Best of luck going forward.`,
  absurd: `Thanks for getting back to me. I was wondering where you’d landed on the offer, so I appreciate the reply. It’s a shame you won’t be joining us for the trial, but I respect your decision and wish you all the best.`,
};

export function getTrialLatePlayerResponse(accepted: boolean) {
  return accepted
    ? `Sorry for the late reply. I really appreciate the opportunity and I am happy to accept the trial.`
    : `Sorry for the late reply. I appreciate the opportunity, but I currently don't have any interest in trialing for your team.`;
}

export function getTrialCoachLateResponse(band: string | null | undefined, accepted: boolean) {
  const responses = accepted ? LATE_TRIAL_ACCEPTED_RESPONSES : LATE_TRIAL_REJECTED_RESPONSES;
  return responses[band ?? ''] ?? responses.poor;
}

const TRIAL_REMINDER_RESPONSES: Record<string, string> = {
  poor: `Just following up on the trial offer. It’ll remain open for one more day. If I don’t hear back from you by then, I’ll reconsider the offer.`,
  adequate: `Just checking in regarding the trial offer. I can keep it open for one more day, but after that I’ll need to reconsider.`,
  good: `Just following up on the trial offer. I’m still interested in seeing how you’d perform with the team, but I can only keep the offer open for one more day. After that, I’ll need to reconsider.`,
  excellent: `Just checking in about the trial. I’d still really like to see what you can do with the team, but the offer will only remain open for one more day. If I don’t hear back by then, I’ll have to reconsider.`,
  absurd: `Just following up on the trial offer. I’m very interested in getting you in with the team, but I can only hold the offer for one more day. If I don’t hear back by then, I’ll need to reconsider and look at the other options.`,
};

const TRIAL_EXPIRED_RESPONSES: Record<string, string> = {
  poor: `Since I haven’t heard back, the trial offer is no longer available. I’ve decided to move forward with other options. Best of luck going forward.`,
  adequate: `The trial offer has now expired, so I’ll be moving ahead with other options. Thanks for your time, and best of luck with what comes next.`,
  good: `Since I didn’t hear back in time, I’ve had to withdraw the trial offer and move forward with other options. I was interested to see how you’d perform with the team. Best of luck going forward.`,
  excellent: `The trial offer is no longer available, as I’ve had to move forward with other options. I was very interested in seeing how you’d perform with the team, so it’s unfortunate we couldn’t make it happen. Best of luck going forward.`,
  absurd: `I’ve had to withdraw the trial offer and move forward with other options. Your FACEIT performances really stood out to me, so I was genuinely interested in seeing how you’d perform with the team. Unfortunately, I couldn’t keep the offer open any longer. Best of luck going forward.`,
};

export function getTrialReminderResponse(band: string | null | undefined) {
  return TRIAL_REMINDER_RESPONSES[band ?? ''] ?? TRIAL_REMINDER_RESPONSES.poor;
}

export function getTrialExpiredResponse(band: string | null | undefined) {
  return TRIAL_EXPIRED_RESPONSES[band ?? ''] ?? TRIAL_EXPIRED_RESPONSES.poor;
}

const TRIAL_FAILURE_RESPONSES = {
  player: {
    near: `You came very close to reaching the performance goal, and overall I was happy with a lot of what you showed during the trial. In the end, though, I don’t think the role and the way I want the team structured are quite the right fit. Since you also fell just short of the goal, I’ve decided not to move forward with a contract. Thanks for the effort, and best of luck going forward.`,
    good: `There were some good moments during the trial, but I don’t think the fit was quite right overall. Your performance was a little below the level I was looking for, and there were also some issues with how your role fit into the way I want the team to play. Because of that, I won’t be moving forward with a contract. Thanks for the effort and best of luck going forward.`,
    partial: `Thanks for the effort you put into the trial. Unfortunately, the performance level was below what I needed to see, and I also didn’t feel the role fit worked well enough within the team. There were a few things structurally that would have been difficult to make work long term, so I won’t be moving forward with a contract. Best of luck going forward.`,
    low: `Thanks for taking part in the trial. Unfortunately, the performance was too far below the level I was looking for, and I didn’t feel the role or overall fit with the team was strong enough either. With both of those things in mind, I’ve decided not to move forward with a contract. I appreciate you giving it a try, and I wish you the best going forward.`,
  },
  igl: {
    none: `Thanks for taking on the trial. Unfortunately, the way you wanted to lead and structure the team never really clicked with the lineup, and I also felt that our views on how the game should be played were too far apart. On top of that, I didn’t feel every player fully bought into your in-game leadership. Because of that, I won’t be moving forward with a contract. I appreciate the effort and wish you the best going forward.`,
    low: `Thanks for the effort you put into the trial. There were some ideas I liked, but overall the style of CS you wanted to implement didn’t mesh well enough with the team, and I felt our vision of how the game should be played was still too different. Because of that, I don’t think the fit is right and I won’t be moving forward with a contract. Best of luck going forward.`,
    half: `There were definitely parts of your in-game leading that worked, and I could see what you were trying to build. In the end, though, I felt the team was only partially comfortable with the style you wanted to play, and there were still some important differences between your vision of the game and mine. I don’t think the overall fit is strong enough to move forward with a contract. Thanks for the trial, and best of luck going forward.`,
    close: `I was happy with a lot of what you showed during the trial, and your approach to leading the team worked well in several areas. Ultimately, though, I still felt there were some differences in how you wanted the team to play compared to the direction I want to take it. The fit was close, but not quite right enough for me to move forward with a contract. Thanks for the effort, and best of luck going forward.`,
  },
} as const;

export function getTrialFailureResponse(role: string | null | undefined, completionPct: number) {
  const completion = Number.isFinite(completionPct) ? completionPct : 0;

  if (role?.toUpperCase() === 'IGL') {
    if (completion <= 0) return TRIAL_FAILURE_RESPONSES.igl.none;
    if (completion < 50) return TRIAL_FAILURE_RESPONSES.igl.low;
    if (completion === 50) return TRIAL_FAILURE_RESPONSES.igl.half;
    return TRIAL_FAILURE_RESPONSES.igl.close;
  }

  if (completion >= 90) return TRIAL_FAILURE_RESPONSES.player.near;
  if (completion >= 75) return TRIAL_FAILURE_RESPONSES.player.good;
  if (completion >= 50) return TRIAL_FAILURE_RESPONSES.player.partial;
  return TRIAL_FAILURE_RESPONSES.player.low;
}

const TRIAL_SUCCESS_RESPONSES = {
  igl: {
    lowRating: `You met the goals I set for the trial, and I’m happy with the way you led and structured the team. Your individual performance wasn’t quite where I’d like it to be, but your impact as an IGL was enough to convince me that this can work. I want to bring you into the team, and I’m now in active talks with the management board to get a contract prepared for you. Expect a message from the team’s management tomorrow with the next steps.`,
    goodRating: `You met the goals I set for the trial, and I liked what I saw from both your leadership and your individual game. The team responded well to the way you wanted to play, and I think we can build on that. I want you in the team, and I’m now in active talks with the management board to get your contract put together. Expect to hear from the team’s management tomorrow regarding the contract and next steps.`,
    highRating: `You delivered everything I was looking for during the trial. The team responded well to your leadership, the style you implemented worked, and you backed it up with a very strong individual performance as well. I definitely want to move forward with you. I’m already in active talks with the management board to get a contract prepared and sent over to you. Expect a message from the team’s management tomorrow so we can get everything moving.`,
  },
  rifler: {
    met: `You reached the performance goal I set for the trial, and you showed enough overall for me to feel comfortable moving forward. There are still a few areas I’d like to see improve, but I think you can fit into the team and develop further with us. I want to bring you in, and I’m now in active talks with the management board to get a contract prepared for you. Expect a message from the team’s management tomorrow with the next steps.`,
    strong: `You had a strong trial and comfortably exceeded the performance goal I set for you. I liked what you brought individually, and I think your role fits well with what I want from the team. I’m happy to move forward with you, and I’m now in active talks with the management board to get your contract put together. Expect to hear from the team’s management tomorrow regarding the contract and next steps.`,
    excellent: `You had an excellent trial and performed well above the level I was looking for. You made a very strong case for yourself individually, and I’m confident you can be an important part of this lineup. I definitely want to move forward with you. I’m already in active talks with the management board to get a contract prepared and sent over. Expect a message from the team’s management tomorrow so we can get everything moving.`,
  },
  awper: {
    met: `You reached the performance goal I set for the trial, and you showed enough for me to feel comfortable moving forward. I think the team can benefit from having an AWPer with your profile, and there’s room to build on what you showed during the trial. I want to bring you in, and I’m now in active talks with the management board to get a contract prepared for you. Expect a message from the team’s management tomorrow with the next steps.`,
    strong: `You had a strong trial and comfortably exceeded the performance goal I set for you. Your AWPing gives the team another level of threat and improves what we can do around the role. I think you fit what we need, and I’m happy to move forward with you. I’m now in active talks with the management board to get your contract put together. Expect to hear from the team’s management tomorrow regarding the contract and next steps.`,
    excellent: `You had an excellent trial and performed well above the level I was looking for. You showed that you can give the team a real difference-maker on the AWP, and I think your presence significantly raises our ceiling in that role. I definitely want to move forward with you. I’m already in active talks with the management board to get a contract prepared and sent over. Expect a message from the team’s management tomorrow so we can get everything moving.`,
  },
} as const;

export function getTrialSuccessResponse(
  role: string | null | undefined,
  completionPct: number,
  rating: number,
) {
  const response = getTrialSuccessResponseTier(role, completionPct, rating);
  const normalizedRole = role?.toUpperCase();
  if (normalizedRole === 'IGL') {
    if (response === 1) return TRIAL_SUCCESS_RESPONSES.igl.lowRating;
    if (response === 2) return TRIAL_SUCCESS_RESPONSES.igl.goodRating;
    return TRIAL_SUCCESS_RESPONSES.igl.highRating;
  }

  const responses =
    normalizedRole === 'AWPER' ? TRIAL_SUCCESS_RESPONSES.awper : TRIAL_SUCCESS_RESPONSES.rifler;
  if (response === 3) return responses.excellent;
  if (response === 2) return responses.strong;
  return responses.met;
}

export function getTrialSuccessResponseTier(
  role: string | null | undefined,
  completionPct: number,
  rating: number,
): 1 | 2 | 3 {
  if (role?.toUpperCase() === 'IGL') {
    if (rating < 1) return 1;
    if (rating <= 1.5) return 2;
    return 3;
  }
  if (completionPct >= 150) return 3;
  if (completionPct >= 125) return 2;
  return 1;
}
