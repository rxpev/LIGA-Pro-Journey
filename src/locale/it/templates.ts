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
  SUBJECT = 'Congratulazioni {{it.profile.team.name}}!',
  CONTENT = `
  Ciao, {{it.profile.player.name}}!

  Complimenti per aver vinto **{{it.competition}}**!

  Continua così!
  `,
}

/** @enum */
export enum AwardTypePromotion {
  SUBJECT = 'Siamo promossi!',
  CONTENT = `
  Ciao, {{it.profile.player.name}}!

  Ben fatto ad aver ottenuto la promozione da **{{it.competition}}**!

  Prossima stagione giocheremo in una divisione più tosta quindi dovremo dare il meglio!
  `,
}

/** @enum */
export enum AwardTypeQualify {
  SUBJECT = 'Qualificati!',
  CONTENT = `
  Hey, {{it.profile.player.name}}!

  Ben fatto per la qualificazione dal **{{it.competition}}** e proseguiamo per il prossimo round!

  D'ora in poi sarà sempre più difficile.
  `,
}

/** @enum */
export enum OfferAcceptedPlayer {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = `
  Ciao, {{it.profile.player.name}}.

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  Il giocatore, **{{it.transfer.target.name}}**, è stato venduto a {{it.transfer.from.name}}.
  {{#else}}
  Ho il piacere di informarti che **{{it.transfer.target.name}}** ha accettato la nostra offerta.

  Non vede l'ora di mostrare le sue abilità!
  {{/if}}
  `,
}

/** @enum */
export enum OfferAcceptedTeam {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = `
  Ciao, {{it.profile.player.name}}.

  Quell'offerta va bene per noi. Adesso sta a **{{it.transfer.target.name}}** decidere di accettare lo stipendio proposto.
  `,
}

/** @enum */
export enum OfferAcceptedUser {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = `Accettata l'offerta di {{it.transfer.from.name}}'`,
}

/** @enum */
export enum OfferGeneric {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = '',
}

/** @enum */
export enum OfferIncoming {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = `
  Ciao, {{it.profile.player.name}}.

  **{{it.transfer.from.name}}** sono interessati in un trasferimento per **{{it.transfer.target.name}}**.

  I dettagli sono qui sotto:

  - Offerta Trasferimento: {{it.transfer.offers[0].cost | currency}}

  - Stipendio: {{it.transfer.offers[0].wages | currency}}

  ---

  <button className="btn btn-primary" data-ipc-route="/transfer/accept" data-payload="{{it.transfer.id}}">Accept Offer</button>
  <button className="btn btn-ghost" data-ipc-route="/transfer/reject" data-payload="{{it.transfer.id}}">Reject Offer</button>
  `,
}

/** @enum */
export enum OfferRejectedEmailCost {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = `
  Hey {{it.profile.player.name}},

  Non siamo disposti a vendere il nostro giocatore ad una cifra irrisoria.
  `,
}

/** @enum */
export enum OfferRejectedEmailRelocate {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = `
  Ciao {{it.profile.player.name}},

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  Le trattative tra il giocatore e **{{it.transfer.from.name}}** sono fallite perchè non ha intenzione di cambiare regione.
  {{#else}}
  Il giocatore ha rifiutato la tua offerta perchè non è intenzionato a cambiare regione.
  {{/if}}
  `,
}

/** @enum */
export enum OfferRejectedEmailSquadDepth {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = `
  Ciao {{it.profile.player.name}},

  Non abbiamo intenzione di cedere questo giocatore in quanto fondamentale per la nostra squadra.
  `,
}

/** @enum */
export enum OfferRejectedEmailUnlisted {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = `
  Hey {{it.profile.player.name}},

  Non abbiamo intenzione di cedere questo giocatore in quanto non è in lista trasferimenti.
  `,
}

/** @enum */
export enum OfferRejectedEmailWages {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = `
  Hey {{it.profile.player.name}},

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  Le trattative tra il giocatore e **{{it.transfer.from.name}}** sono fallite perchè non sono riusciti a concordare lo stipendio.
  {{#else}}
  Il giocatore ha rifiutato la tua offerta perchè a quanto dicono lo stipendio offerto era troppo basso.

  Dovremmo spendere di più per questo giocatore, se possiamo permettercelo.
  {{/if}}
  `,
}

/** @enum */
export enum OfferRejectedUser {
  SUBJECT = 'Offerta di trasferimento per {{it.transfer.target.name}}',
  CONTENT = `Rifiutata l'offerta di {{it.transfer.from.name}}'.`,
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
  SUBJECT = 'Hey!',
  CONTENT = `
  Ciao, {{it.profile.player.name}}!

  Mi chiamo {{it.persona.name}} e sono il tuo assistente manageriale.

  La nostra prima partita è in arrivo perciò volevo farti sapere un paio di cose:

  - Una volta in-gioco puoi scrivere \`.ready\` nella chat e la partita inizierà immediatamente.
  - Puoi anche aspettare che il timer del riscaldamento finisca.
  - Finita la partita, puoi chiudere il gioco in quanto il punteggio verrà automaticamente registrato.

  Buona fortuna, divertiti!
  `,
}
