/**
 * Contains localized template strings used for
 * dynamic content generation. These templates
 * are rendered using Squirrelly.
 *
 * Used primarily for generating emails and
 * rich-text messages within the application.
 *
 * @module
 */

/** @enum */
export enum AwardTypeChampion {
  SUBJECT = 'Congratulations {{it.profile.team.name}}!',
  CONTENT = `
  Hi, {{it.profile.player.name}}!

  Congrats on winning the **{{it.competition}}**!

  Keep up the good work!
  `,
}

/** @enum */
export enum AwardTypePromotion {
  SUBJECT = 'Moving on up!',
  CONTENT = `
  Hi, {{it.profile.player.name}}!

  Good job on getting promoted from **{{it.competition}}**!

  Next season we'll be playing in a tougher division so let's do our best!
  `,
}

/** @enum */
export enum AwardTypeQualify {
  SUBJECT = 'Qualified!',
  CONTENT = `
  Hey, {{it.profile.player.name}}!

  Good job on qualifying from the **{{it.competition}}** and moving on to the next round!

  It's only going to get tougher from here.
  `,
}

/** @enum */
export enum OfferAcceptedPlayer {
  SUBJECT = 'Transfer Offer for {{it.transfer.target.name}}',
  CONTENT = `
  Hi, {{it.profile.player.name}}.

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  The player, **{{it.transfer.target.name}}**, has been sold to {{it.transfer.from.name}}.
  {{#else}}
  I'm pleased to inform you that **{{it.transfer.target.name}}** has accepted our offer.

  Let's use him in our squad!
  {{/if}}
  `,
}

/** @enum */
export enum OfferAcceptedTeam {
  SUBJECT = 'Transfer Offer for {{it.transfer.target.name}}',
  CONTENT = `
  Hi, {{it.profile.player.name}}.

  That offer works for us. It is now up to **{{it.transfer.target.name}}** on whether they choose to accept your proposed wages.
  `,
}

/** @enum */
export enum OfferAcceptedUser {
  SUBJECT = "Contract Offer from {{it.transfer.from.name}}",
  CONTENT = "Accepted {{it.transfer.from.name}}'s offer.",
}

/** @enum */
export enum OfferGeneric {
  SUBJECT = 'Transfer Offer for {{it.transfer.target.name}}',
  CONTENT = '',
}

/** @enum */
export enum OfferIncoming {
  SUBJECT = "Contract Offer from {{it.transfer.from.name}}",
  CONTENT = `Hello, {{it.profile.player.name}}.

  We at **{{it.transfer.from.name}}** would like to offer you a contract.
  Please note that this offer is only valid for the next 7 days.

  **Team details:**

  - Division: {{it.fromTierName}}

  - Country: {{it.transfer.from.country.name}}


  **Offer details:**

  - Contract length: {{it.transfer.offers[0].contractYears}} year(s)

  ---

  <button className="btn btn-primary" data-ipc-route="/transfer/accept" data-payload="{{it.transfer.id}}">Accept Offer</button>
  <button className="btn btn-ghost" data-ipc-route="/transfer/reject" data-payload="{{it.transfer.id}}">Reject Offer</button>
  `,
  }

/** @enum */
export enum OfferRejectedEmailCost {
  SUBJECT = 'Transfer Offer for {{it.transfer.target.name}}',
  CONTENT = `
  Hey {{it.profile.player.name}},

  We are not willing to sell the player for such a low cost.
  `,
}

/** @enum */
export enum OfferRejectedEmailRelocate {
  SUBJECT = 'Transfer Offer for {{it.transfer.target.name}}',
  CONTENT = `
  Hi {{it.profile.player.name}},

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  Talks between the player and **{{it.transfer.from.name}}** have broken down because they are not willing to move regions.
  {{#else}}
  The player has rejected your offer because they are not willing to move to our region.
  {{/if}}
  `,
}

/** @enum */
export enum OfferRejectedEmailSquadDepth {
  SUBJECT = 'Transfer Offer for {{it.transfer.target.name}}',
  CONTENT = `
  Hi {{it.profile.player.name}},

  We are not open to selling this player as they are crucial to our squad.
  `,
}

/** @enum */
export enum OfferRejectedEmailUnlisted {
  SUBJECT = 'Transfer Offer for {{it.transfer.target.name}}',
  CONTENT = `
  Hey {{it.profile.player.name}},

  We are not willing to sell the player as he is not up for transfer.
  `,
}

/** @enum */
export enum OfferRejectedEmailWages {
  SUBJECT = 'Transfer Offer for {{it.transfer.target.name}}',
  CONTENT = `
  Hey {{it.profile.player.name}},

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  Talks between the player and **{{it.transfer.from.name}}** have broken down because they could not reach an agreement on wages.
  {{#else}}
  The player has rejected your offer because they say the wages offered are too low.

  We might have to spend a little more for this player, if we can afford it.
  {{/if}}
  `,
}

/** @enum */
export enum OfferRejectedUser {
  SUBJECT = "Contract Offer from {{it.transfer.from.name}}",
  CONTENT = `Rejected {{it.transfer.from.name}}'s offer.`,
}

export enum ContractExpiredPlayer {
  SUBJECT = 'Contract expired with {{it.team.name}}',
  CONTENT = `
  Hello, {{it.profile.player.name}}.

  Your contract with **{{it.team.name}}** has expired.

  You are now a free agent. Feel free to explore new opportunities!
  `,
}

/** @enum */
export enum PlayerBenched {
  SUBJECT = "Squad update from {{it.team.name}}",
  CONTENT = `Hello, {{it.profile.player.name}}.

This is an update regarding your role at **{{it.team.name}}**.
You have been moved to the bench and placed on the transfer list.

**Context**

Your performance in the {{it.tierName}} has not met the expectations set by the management.
Your statistics and KD of **{{it.kd}}** in the last 30 days has not been satisfactory.

You can still receive offers while benched. We wish you the best of luck in finding a new team!

---`
}

/** @enum */
export enum PlayerKicked {
  SUBJECT = "Contract terminated by {{it.team.name}}",
  CONTENT = `Hello, {{it.profile.player.name}}.

We are writing to inform you that we at **{{it.team.name}}** have terminated your contract early.

The team has decided to part ways due to your recent performance in the {{it.tierName}} not aligning with the club's standards.
We understand that this news may come as a surprise, but we believe this decision is in the best interest of both parties.
You may start looking for a new team immediately.

---`
}

/** @enum */
export enum ContractExtensionOffer {
  SUBJECT = "Contract extension offer from {{it.transfer.from.name}}",
  CONTENT = `Hello, {{it.profile.player.name}}.

We at **{{it.transfer.from.name}}** would like to extend your contract.
We value your contributions to the team and would like to keep you on board for the upcoming seasons.
Please note that this offer is only valid for the rest of your current contract duration.

**Offer details**

- New contract length: {{it.contractYears}} year(s)

- Time left on current contract: {{it.daysLeft}} day(s)

---

<button className="btn btn-primary" data-ipc-route="/transfer/accept" data-payload="{{it.transfer.id}}">Accept Extension</button>
<button className="btn btn-ghost" data-ipc-route="/transfer/reject" data-payload="{{it.transfer.id}}">Reject</button>
`
}

export enum ContractExtensionAccepted {
  SUBJECT = "Contract extension offer from {{it.transfer.from.name}}",
  CONTENT = "Accepted {{it.transfer.from.name}}'s extension offer.",
}

/** @enum */
export enum ContractExtensionRejected {
  SUBJECT = "Contract extension offer from {{it.transfer.from.name}}",
  CONTENT = "Rejected {{it.transfer.from.name}}'s extension offer.",
}
/** @enum */
export enum ContractExtensionExpired {
  SUBJECT = "Contract extension offer from {{it.transfer.from.name}}",
  CONTENT = "Expired {{it.transfer.from.name}}'s offer.",
}

/** @enum */
export enum OfferExpiredUser {
  SUBJECT = "Contract Offer from {{it.transfer.from.name}}",
  CONTENT = "Expired {{it.transfer.from.name}}'s offer.",
}

/** @enum */
export enum WelcomeEmail {
  SUBJECT = 'Hey!',
  CONTENT = `
  Hi, {{it.profile.player.name}}!

  My name is {{it.persona.name}} and I am your assistant manager. I just wanted to say hello and introduce myself.

  Our first match is coming up so I wanted to let you know about a few things.

  - Once you're in-game you can type \`.ready\` in chat and the match will start immediately.
  - You can also wait for the warm-up timer to finish.
  - After the match is over, you can close out your game as the score will be automatically recorded.

  GL HF!
  `,
}
