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
export enum PlayerBenched {
  SUBJECT = "Squad update from {{it.team.name}}",
  CONTENT = `Hello, {{it.profile.player.name}}.

This is an update regarding your role at **{{it.team.name}}**.
You have been moved to the bench and placed on the transfer list.

**Context**

Your performance in the {{it.tierName}} has not met the expectations set by the management.
Your statistics and KD of {{it.kd}} in the last 30 days has not been satisfactory.

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
`
}

/** @enum */
export enum ContractExtensionOffer {
  SUBJECT = "Contract extension offer from {{it.transfer.from.name}}",
  CONTENT = `Hello, {{it.profile.player.name}}.

We at **{{it.transfer.from.name}}** would like to extend your contract.
We value your contributions to the team and would like to keep you on board for the upcoming seasons.

**Offer details**

- New contract length: {{it.contractYears}} year(s)

- Time left on current contract: {{it.daysLeft}} day(s)

---

<button className="btn btn-primary" data-ipc-route="/transfer/accept" data-payload="{{it.transfer.id}}">Accept Extension</button>
<button className="btn btn-ghost" data-ipc-route="/transfer/reject" data-payload="{{it.transfer.id}}">Reject</button>
`
}

export enum ContractExtensionAccepted {
  SUBJECT = "Extension accepted — {{it.team.name}}",
  CONTENT = `Hello, {{it.profile.player.name}}.

We are happy you decided to stick with us at **{{it.team.name}}**.

**New contract**

- Length: {{it.years}} year(s)

- Contract end date: {{it.contractEndDate}}

From here on, let's aim for greater heights together!
`
}

/** @enum */
export enum ContractExtensionRejected {
  SUBJECT = "Re: Contract extension — {{it.transfer.from.name}}",
  CONTENT = `Hello, {{it.profile.player.name}}.

It's unfortunate to hear that you have decided not to extend your contract with **{{it.transfer.from.name}}**.
We respect your decision and wish you the best of luck in your future endeavors.
`
}

/** @enum */
export enum AwardTypeChampion {
  SUBJECT = 'Félicitations {{it.profile.team.name}} !',
  CONTENT = `
  Salut {{it.profile.player.name}} !

  Bravo pour ta magnifique victoire en **{{it.competition}}** !

  Continue comme ça, tu fais du très bon boulot !
  `,
}

/** @enum */
export enum AwardTypePromotion {
  SUBJECT = 'En avant la promotion !',
  CONTENT = `
  Salut {{it.profile.player.name}}!

  Bravo pour ton excellent travail en **{{it.competition}}**, on a réussi à obtenir une promotion en division supérieure !

  Pour la prochaine saison, il faudra s'attendre à une compétition plus rude. On va faire de notre mieux, mais on va y arriver, courage !
  `,
}

/** @enum */
export enum AwardTypeQualify {
  SUBJECT = 'On est qualifiés !',
  CONTENT = `
  Salut {{it.profile.player.name}} !

  Bravo pour cette qualification en **{{it.competition}}** qui nous permet d'avancer au prochain round !

  On s'attend à des matchs plus difficiles, mais on y croit !
  `,
}

/** @enum */
export enum OfferAcceptedPlayer {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = `
  Salut {{it.profile.player.name}}.

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  **{{it.transfer.target.name}}** a été transféré(e) chez {{it.transfer.from.name}}.
  {{#else}}
  J'ai le plaisir de t'annoncer que **{{it.transfer.target.name}}** a accepté notre offre !

  On peut désormais l'intégrer dans notre roster, si tu le souhaites, bien entendu.
  {{/if}}
  `,
}

/** @enum */
export enum OfferAcceptedTeam {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = `
  Salut {{it.profile.player.name}}.

  L'offre que tu nous a proposé nous convient. **{{it.transfer.target.name}}** nous donnera sa décision par rapport au salaire que tu viens de lui proposer.
  `,
}

/** @enum */
export enum OfferAcceptedUser {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = `Offre acceptée pour {{it.transfer.from.name}}.`,
}

/** @enum */
export enum OfferGeneric {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = '',
}

/** @enum */
export enum OfferIncoming {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = `
  Salut {{it.profile.player.name}}.

  **{{it.transfer.from.name}}** est intéressée par **{{it.transfer.target.name}}** et nous propose une offre de transfert.

  Voici les détails de l'offre :

  - Frais de transfert : {{it.transfer.offers[0].cost | currency}}

  - Salaire : {{it.transfer.offers[0].wages | currency}}

  ---

  <button className="btn btn-primary" data-ipc-route="/transfer/accept" data-payload="{{it.transfer.id}}">Accepter l'offre</button>
  <button className="btn btn-ghost" data-ipc-route="/transfer/reject" data-payload="{{it.transfer.id}}">Rejeter l'offre</button>
  `,
}

/** @enum */
export enum OfferRejectedEmailCost {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = `
  Salut {{it.profile.player.name}}.

  Désolé, mais nous ne pouvons pas accepter ce transfert pour un prix ridiculement bas.
  `,
}

/** @enum */
export enum OfferRejectedEmailRelocate {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = `
  Salut {{it.profile.player.name}}.

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  C'est un échec pour le transfert de chez **{{it.transfer.from.name}}**, la personne ne veut pas changer de région.
  {{#else}}
  La personne a rejeté ton offre, elle n'a pas envie de changer de région.
  {{/if}}
  `,
}

/** @enum */
export enum OfferRejectedEmailSquadDepth {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = `
  Salut {{it.profile.player.name}}.

  Nous ne pouvons pas transférer cette personne, car c'est un élément indispensable à notre équipe.
  `,
}

/** @enum */
export enum OfferRejectedEmailUnlisted {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = `
  Salut {{it.profile.player.name}}.

  Nous ne pouvons accepter ton offre, car la personne n'est pas disponible pour un transfert.
  `,
}

/** @enum */
export enum OfferRejectedEmailWages {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = `
  Salut {{it.profile.player.name}}.

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  C'est un échec pour le transfert de chez **{{it.transfer.from.name}}**, aucun accord n'a pu être parvenu concernant le salaire proposé.
  {{#else}}
  La personne a rejeté ton offre, car le salaire proposé était trop bas.

  Il faudra proposer un salaire plus décent, si on peut se le permettre.
  {{/if}}
  `,
}

/** @enum */
export enum OfferRejectedUser {
  SUBJECT = 'Offre de transfert : {{it.transfer.target.name}}',
  CONTENT = `Offre rejetée pour {{it.transfer.from.name}}.`,
}
export enum ContractExpiredPlayer {
  SUBJECT = 'Contract expired with {{it.team.name}}',
  CONTENT = `
  Hello, {{it.profile.player.name}}.

  Your contract with **{{it.team.name}}** has expired.

  You are now a free agent and free to negotiate with other teams.
  `,
}

/** @enum */
export enum WelcomeEmail {
  SUBJECT = 'Bienvenue !',
  CONTENT = `
  Salut {{it.profile.player.name}} !

  Je suis {{it.persona.name}}, ton assistant manager. Je t'envoie ce mail pour te saluer et me présenter en bonne et due forme.

  Notre premier match est bientôt là, je me permets de t'expliquer quelques petits trucs.

  - Une fois que tu es dans la partie, tu peux écrire dans le chat \`.ready\` pour le match démarre immédiatement.
  - Tu peux également attendre la fin du warm-up si tu le souhaites, si tu veux t'entraîner un peu avant.
  - Après la fin du match, tu peux fermer le jeu, le score sera automatiquement sauvegardé.

  GL HF !
  `,
}
