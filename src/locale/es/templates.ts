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
  SUBJECT = '¡Felicidades {{it.profile.team.name}}!',
  CONTENT = `
  ¡Hola, {{it.profile.player.name}}!

  ¡Felicidades por ganar **{{it.competition}}**!

  ¡Sigue con el buen trabajo!
  `,
}

/** @enum */
export enum AwardTypePromotion {
  SUBJECT = '¡Subiendo de nivel!',
  CONTENT = `
  ¡Hola, {{it.profile.player.name}}!

  ¡Buen trabajo ascendiendo desde **{{it.competition}}**!

  La próxima temporada jugaremos en una división más difícil, ¡así que demos lo mejor de nosotros!
  `,
}

/** @enum */
export enum AwardTypeQualify {
  SUBJECT = '¡Clasificado!',
  CONTENT = `
  ¡Hola, {{it.profile.player.name}}!

  Buen trabajo clasificando desde **{{it.competition}}** y avanzando a la siguiente ronda.

  A partir de aquí, solo se pondrá más difícil.
  `,
}

/** @enum */
export enum OfferAcceptedPlayer {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = `
  Hola, {{it.profile.player.name}}.

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  El jugador, **{{it.transfer.target.name}}**, ha sido vendido a {{it.transfer.from.name}}.
  {{#else}}
  Me complace informarte que **{{it.transfer.target.name}}** ha aceptado nuestra oferta.

  ¡Vamos a utilizarlo en nuestra escuadra!
  {{/if}}
  `,
}

/** @enum */
export enum OfferAcceptedTeam {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = `
  Hola, {{it.profile.player.name}}.

  Esa oferta nos parece bien. Ahora depende de **{{it.transfer.target.name}}** si acepta el salario propuesto.
  `,
}

/** @enum */
export enum OfferAcceptedUser {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = `Oferta de {{it.transfer.from.name}} aceptada.`,
}

/** @enum */
export enum OfferGeneric {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = '',
}

/** @enum */
export enum OfferIncoming {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = `
  Hola, {{it.profile.player.name}}.

  **{{it.transfer.from.name}}** está interesado en una transferencia por **{{it.transfer.target.name}}**.

  Los detalles son los siguientes:

  - Tarifa de transferencia: {{it.transfer.offers[0].cost | currency}}

  - Salario: {{it.transfer.offers[0].wages | currency}}

  ---

  <button className="btn btn-primary" data-ipc-route="/transfer/accept" data-payload="{{it.transfer.id}}">Aceptar Oferta</button>
  <button className="btn btn-ghost" data-ipc-route="/transfer/reject" data-payload="{{it.transfer.id}}">Rechazar Oferta</button>
  `,
}

/** @enum */
export enum OfferRejectedEmailCost {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = `
  Hola {{it.profile.player.name}},

  No estamos dispuestos a vender al jugador por un precio tan bajo.
  `,
}

/** @enum */
export enum OfferRejectedEmailRelocate {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = `
  Hola {{it.profile.player.name}},

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  Las negociaciones entre el jugador y **{{it.transfer.from.name}}** se han roto porque no están dispuestos a cambiar de región.
  {{#else}}
  El jugador ha rechazado tu oferta porque no está dispuesto a mudarse a nuestra región.
  {{/if}}
  `,
}

/** @enum */
export enum OfferRejectedEmailSquadDepth {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = `
  Hola {{it.profile.player.name}},

  No estamos dispuestos a vender a este jugador ya que es crucial para nuestra escuadra.
  `,
}

/** @enum */
export enum OfferRejectedEmailUnlisted {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = `
  Hola {{it.profile.player.name}},

  No estamos dispuestos a vender al jugador ya que no está disponible para transferencia.
  `,
}

/** @enum */
export enum OfferRejectedEmailWages {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = `
  Hola {{it.profile.player.name}},

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  Las negociaciones entre el jugador y **{{it.transfer.from.name}}** se han roto porque no pudieron llegar a un acuerdo salarial.
  {{#else}}
  El jugador ha rechazado tu oferta porque considera que el salario ofrecido es demasiado bajo.

  Puede que tengamos que gastar un poco más si realmente queremos a este jugador.
  {{/if}}
  `,
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
export enum OfferRejectedUser {
  SUBJECT = 'Oferta de Transferencia para {{it.transfer.target.name}}',
  CONTENT = `Oferta de {{it.transfer.from.name}} rechazada.`,
}

/** @enum */
export enum WelcomeEmail {
  SUBJECT = '¡Hola!',
  CONTENT = `
  ¡Hola, {{it.profile.player.name}}!

  Me llamo {{it.persona.name}} y soy tu asistente. Solo quería saludarte y presentarme.

  Nuestro primer partido se acerca, así que quería contarte algunas cosas.

  - Una vez que estés en el juego, puedes escribir \`.ready\` en el chat y el partido comenzará de inmediato.
  - También puedes esperar a que termine el temporizador de calentamiento.
  - Después del partido, puedes cerrar el juego, ya que la puntuación se registrará automáticamente.

  ¡GL HF!
  `,
}
