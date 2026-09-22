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
