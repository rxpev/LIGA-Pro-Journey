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
  SUBJECT = 'Parabéns, {{it.profile.team.name}}!',
  CONTENT = `
  Salve, {{it.profile.player.name}}!

  Parabéns por ganhar o **{{it.competition}}**!

  Foguete não tem ré! Continua assim!
  `,
}

/** @enum */
export enum AwardTypePromotion {
  SUBJECT = 'Subiiiuuuuu!',
  CONTENT = `
  Salve, {{it.profile.player.name}}!

  Parabéns por subir de divisão no **{{it.competition}}**!

  Se prepare, porque a próxima temporada vai ser mais difícil! Vamo nessa!
  `,
}

/** @enum */
export enum AwardTypeQualify {
  SUBJECT = 'Que venha a próxima fase!',
  CONTENT = `
  Salve, {{it.profile.player.name}}!

  Mandou bem! Avançou de fase no **{{it.competition}}**!

  O desafio agora vai ser maior. Bala neles!
  `,
}

/** @enum */
export enum OfferAcceptedPlayer {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = `
  Olá, {{it.profile.player.name}}.

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  O(a) atleta, **{{it.transfer.target.name}}**, foi transferido(a) pro {{it.transfer.from.name}}.
  {{#else}}
  Vim te dar a boa notícia: **{{it.transfer.target.name}}** aceitou a oferta e está chegando!

  Não se esqueça de olhar o elenco!
  {{/if}}
  `,
}

/** @enum */
export enum OfferAcceptedTeam {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = `
  Olá, {{it.profile.player.name}}.

  Essa oferta serve pra nós. Agora o(a) **{{it.transfer.target.name}}** decide se fica com a gente ou se vai pro seu time.
  `,
}

/** @enum */
export enum OfferAcceptedUser {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = `Ele(a) aceitou a oferta do {{it.transfer.from.name}}.`,
}

/** @enum */
export enum OfferGeneric {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = '',
}

/** @enum */
export enum OfferIncoming {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = `
  Olá, {{it.profile.player.name}}.

  **{{it.transfer.from.name}}** está interessado no(na) atleta **{{it.transfer.target.name}}**.

  Seguem os detalhes:

  - Taxa de transferência: {{it.transfer.offers[0].cost | currency}}

  - Salário: {{it.transfer.offers[0].wages | currency}}

  ---

  <button className="btn btn-primary" data-ipc-route="/transfer/accept" data-payload="{{it.transfer.id}}">Accept Offer</button>
  <button className="btn btn-ghost" data-ipc-route="/transfer/reject" data-payload="{{it.transfer.id}}">Reject Offer</button>
  `,
}

/** @enum */
export enum OfferRejectedEmailCost {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = `
  Olá {{it.profile.player.name}},

  Achamos o valor da sua oferta muito baixo, assim não terá acordo.
  `,
}

/** @enum */
export enum OfferRejectedEmailRelocate {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = `
  Olá {{it.profile.player.name}},

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  As conversas entre o(a) atleta e o clube **{{it.transfer.from.name}}** deram errado porque ele(a) não quer mudar de continente.
  {{#else}}
  O(a) atleta rejeitou a oferta porque não quer se mudar pro seu continente.
  {{/if}}
  `,
}

/** @enum */
export enum OfferRejectedEmailSquadDepth {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = `
  Olá {{it.profile.player.name}},

  Não queremos vender esse(a) atleta porque é importante demais pra nossa equipe.
  `,
}

/** @enum */
export enum OfferRejectedEmailUnlisted {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = `
  Olá {{it.profile.player.name}},

  Este(a) atleta não está disponível para transferências. Obrigado pelo seu interesse.
  `,
}

/** @enum */
export enum OfferRejectedEmailWages {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = `
  Olá {{it.profile.player.name}},

  {{@if(it.transfer.to && it.transfer.to.id == it.profile.team.id)}}
  As conversas entre o(a) atleta e o clube **{{it.transfer.from.name}}** deram errado porque ele(a) não aceitou o salário oferecido.
  {{#else}}
  O(a) atleta rejeitou a oferta porque achou o salário muito baixo.

  Voz da consciência: "talvez um salário maior resolva..."
  {{/if}}
  `,
}

/** @enum */
export enum OfferRejectedUser {
  SUBJECT = 'Oferta de transferência por {{it.transfer.target.name}}',
  CONTENT = `Rejeitou a oferta do {{it.transfer.from.name}}.`,
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
export enum SponsorshipAccepted {
  SUBJECT = 'Oferta de patrocínio do {{it.sponsorship.sponsor.name}}',
  CONTENT = `
  Salve, {{it.profile.player.name}}.

  Boas notícias! **{{it.sponsorship.sponsor.name}}** aceitou a proposta e é o nosso novo patrocinador!
  `,
}

/** @enum */
export enum SponsorshipBonuses {
  SUBJECT = 'Oferta de patrocínio do {{it.sponsorship.sponsor.name}}',
  CONTENT = `
  Olá, {{it.profile.player.name}}.

  Mandou bem nessa temporada! **{{it.sponsorship.sponsor.name}}** ficou feliz com o desempenho do time e mandou um presente:

  {{@each(it.bonuses) => bonus}}
  - {{bonus}}
  {{/each}}
  `,
}

/** @enum */
export enum SponsorshipGeneric {
  SUBJECT = 'Oferta de patrocínio do {{it.sponsorship.sponsor.name}}',
  CONTENT = '',
}

/** @enum */
export enum SponsorshipInvite {
  SUBJECT = 'Convite pra torneio do {{it.sponsorship.sponsor.name}}',
  CONTENT = `
  Salve {{it.profile.player.name}}!

  Recebemos um convite pra jogar o torneio **{{it.idiomaticTier}}**, cortesia do nosso patrocinador **{{it.sponsorship.sponsor.name}}**.

  Você decide: vamos?

  ---

  <button className="btn btn-primary" data-ipc-route="/sponsorship/invite/accept" data-payload="{{it.sponsorship.id}}">Accept Invite</button>
  <button className="btn btn-ghost" data-ipc-route="/sponsorship/invite/reject" data-payload="{{it.sponsorship.id}}">Reject Invite</button>
  `,
}

/** @enum */
export enum SponsorshipInviteAcceptedUser {
  SUBJECT = 'Convite pra torneio do {{it.sponsorship.sponsor.name}}',
  CONTENT = "Aceitou o convite do {{it.sponsorship.sponsor.name}}.",
}

/** @enum */
export enum SponsorshipInviteRejectedUser {
  SUBJECT = 'Convite pra torneio do {{it.sponsorship.sponsor.name}}',
  CONTENT = "Rejeitou o convite do {{it.sponsorship.sponsor.name}}.",
}

/** @enum */
export enum SponsorshipRejectedTier {
  SUBJECT = 'Oferta de patrocínio para {{it.sponsorship.sponsor.name}}',
  CONTENT = `
  Olá {{it.profile.player.name}},

  Infelizmente, **{{it.sponsorship.sponsor.name}}** rejeitou nosso pedido de patrocínio porque não estamos nas divisões que eles querem. Chegaremos lá!
  `,
}

/** @enum */
export enum SponsorshipRenew {
  SUBJECT = 'Oferta de patrocínio para {{it.sponsorship.sponsor.name}}',
  CONTENT = `
  Salve {{it.profile.player.name}}!

  Seu patrocínio **{{it.sponsorship.sponsor.name}}** expirou, mas eles querem renovar. Aceita?

  ---

  <button className="btn btn-primary" data-ipc-route="/sponsorship/renew/accept" data-payload="{{it.sponsorship.id}}">Accept</button>
  <button className="btn btn-ghost" data-ipc-route="/sponsorship/renew/reject" data-payload="{{it.sponsorship.id}}">Reject</button>
  `,
}

/** @enum */
export enum SponsorhipRenewAcceptedUser {
  SUBJECT = 'Oferta de patrocínio para {{it.sponsorship.sponsor.name}}',
  CONTENT = `Aceitou a oferta do {{it.sponsorship.sponsor.name}}.`,
}

/** @enum */
export enum SponsorhipRenewRejectedUser {
  SUBJECT = 'Oferta de patrocínio para {{it.sponsorship.sponsor.name}}',
  CONTENT = `Rejeitou a oferta do {{it.sponsorship.sponsor.name}}.`,
}

/** @enum */
export enum SponsorshipTerminated {
  SUBJECT = 'Oferta de patrocínio do {{it.sponsorship.sponsor.name}}',
  CONTENT = `
  Olá, {{it.profile.player.name}}.

  Temos uma péssima notícia: **{{it.sponsorship.sponsor.name}}** decidiu encerrar o patrocínio porque não atingimos as metas do contrato.

  Aqui estão as nossas falhas:

  {{@each(it.requirements) => requirement}}
  - {{requirement}}
  {{/each}}
  `,
}

/** @enum */
export enum WelcomeEmail {
  SUBJECT = 'Olá!',
  CONTENT = `
  Salve, {{it.profile.player.name}}!

  Meu nome é {{it.persona.name}} e eu serei seu assistente. Só gostaria de te dar um oi e me apresentar.

  Nosso primeiro jogo tá chegando então eu quero te mostrar umas coisas:

  - Ao entrar no jogo, a partida vai ser oficialmente iniciada quando você digitar \`.ready\` no chat
  - Se quiser aquecer, basta jogar o aquecimento até o tempo acabar.
  - Quando acabar a partida, você pode fechar seu jogo. O placar vai ser registrado automaticamente.

  GL HF!
  `,
}
