type WelcomeGraphicTemplate = {
  aliases?: string[];
  aspectRatio: string;
  avatarLayout: {
    bottom: string;
    height: string;
    left: string;
    maxWidth: string;
  };
  fontFamily: string;
  fontSize: string;
  fontStyle?: string;
  letterSpacing?: string;
  nameLayout: {
    left: string;
    top: string;
    width: string;
  };
  skewX?: string;
  rotate?: string;
  template: string;
  textColor: string;
  textGradient?: string;
  textShadow?: boolean;
  textStroke?: string;
};

type WelcomeGraphicTeam = {
  name?: string | null;
  slug?: string | null;
};

type WelcomeGraphicPlayer = {
  avatar?: string | null;
  name?: string | null;
};

const WELCOME_GRAPHIC_TEMPLATES: Record<string, WelcomeGraphicTemplate> = {
  furia: {
    aliases: ['furia-esports'],
    aspectRatio: '1836 / 857',
    avatarLayout: {
      bottom: '0%',
      height: '90%',
      left: '3%',
      maxWidth: '37%',
    },
    fontFamily: 'BEORNHEARD',
    fontSize: '4.5rem',
    fontStyle: 'oblique 14deg',
    nameLayout: {
      left: '68%',
      top: '84%',
      width: '34%',
    },
    skewX: '-12deg',
    template: 'resources://news/welcome/welcome-furia.png',
    textColor: '#ffffff',
  },
  navi: {
    aliases: ['natus-vincere', 'navi-junior', 'navi-youth'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '112%',
      left: '5%',
      maxWidth: '46%',
    },
    fontFamily: 'JUNEVILLE',
    fontSize: '5.9rem',
    nameLayout: {
      left: '73.5%',
      top: '75.5%',
      width: '49%',
    },
    template: 'resources://news/welcome/welcome-navi.png',
    textColor: '#d6d50b',
  },
  falcons: {
    aliases: ['team-falcons', 'falcon'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '94%',
      left: '58.5%',
      maxWidth: '43%',
    },
    fontFamily: 'BEBAS NEUE',
    fontSize: '6.35rem',
    nameLayout: {
      left: '31%',
      top: '86%',
      width: '43%',
    },
    template: 'resources://news/welcome/welcome-falcons.png',
    textColor: '#ffffff',
  },
  faze: {
    aliases: ['faze-clan'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '100%',
      left: '58.5%',
      maxWidth: '44%',
    },
    fontFamily: 'JUNEVILLE',
    fontSize: '5.95rem',
    nameLayout: {
      left: '32%',
      top: '73.5%',
      width: '43%',
    },
    template: 'resources://news/welcome/welcome-faze.png',
    textColor: '#e32729',
  },
  spirit: {
    aliases: ['team-spirit'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '96%',
      left: '55%',
      maxWidth: '42%',
    },
    fontFamily: 'VERDANA WELCOME',
    fontSize: '4.6rem',
    letterSpacing: '-0.14em',
    nameLayout: {
      left: '26.5%',
      top: '85%',
      width: '44%',
    },
    template: 'resources://news/welcome/welcome-spirit.png',
    textColor: '#ffffff',
  },
  mouz: {
    aliases: ['mousesports'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '95%',
      left: '57%',
      maxWidth: '43%',
    },
    fontFamily: 'VERDANA WELCOME',
    fontSize: '4.4rem',
    letterSpacing: '-0.14em',
    nameLayout: {
      left: '25.5%',
      top: '78%',
      width: '42%',
    },
    template: 'resources://news/welcome/welcome-mouz.png',
    textColor: '#ffffff',
  },
  'the-mongolz': {
    aliases: ['themongolz', 'the-mongolz-academy', 'themongolz-academy'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '91%',
      left: '58%',
      maxWidth: '39%',
    },
    fontFamily: 'ECHIZEN',
    fontSize: '5.3rem',
    fontStyle: 'italic',
    letterSpacing: '-0.04em',
    nameLayout: {
      left: '28%',
      top: '82%',
      width: '42%',
    },
    skewX: '-8deg',
    template: 'resources://news/welcome/welcome-themongolz.png',
    textColor: '#ffffff',
  },
  parivision: {
    aliases: ['pari-vision', 'pari'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '98%',
      left: '58%',
      maxWidth: '43%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '6.1rem',
    nameLayout: {
      left: '28%',
      top: '81%',
      width: '43%',
    },
    template: 'resources://news/welcome/welcome-parivision.png',
    textColor: '#02e8d1',
  },
  g2: {
    aliases: ['g2-esports'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '96%',
      left: '32%',
      maxWidth: '37%',
    },
    fontFamily: 'JUNEVILLE',
    fontSize: '5.4rem',
    letterSpacing: '-4px',
    nameLayout: {
      left: '51%',
      top: '85%',
      width: '50%',
    },
    template: 'resources://news/welcome/welcome-g2.png',
    textColor: '#f90614',
  },
  aurora: {
    aliases: ['aurora-gaming'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '58%',
      maxWidth: '42%',
    },
    fontFamily: 'PEANUT',
    fontSize: '5.35rem',
    letterSpacing: '-0.04em',
    nameLayout: {
      left: '27.5%',
      top: '76%',
      width: '44%',
    },
    skewX: '-7deg',
    template: 'resources://news/welcome/welcome-aurora.png',
    textColor: '#60bfb9',
    textGradient: 'linear-gradient(114.7deg, #ffffff 0%, #60bfb9 56%, #60bfb9 100%)',
  },
  astralis: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '98%',
      left: '54.5%',
      maxWidth: '42%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.5rem',
    nameLayout: {
      left: '31.5%',
      top: '64.5%',
      width: '42%',
    },
    template: 'resources://news/welcome/welcome-astralis.png',
    textColor: '#ffffff',
  },
  '3dmax': {
    aliases: ['3d-max'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '102%',
      left: '53%',
      maxWidth: '43%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.7rem',
    nameLayout: {
      left: '27%',
      top: '88%',
      width: '42%',
    },
    template: 'resources://news/welcome/welcome-3dmax.png',
    textColor: '#cc070b',
  },
  fut: {
    aliases: ['fut-esports'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '52.5%',
      maxWidth: '43%',
    },
    fontFamily: 'JARED',
    fontSize: '5.8rem',
    nameLayout: {
      left: '24%',
      top: '78%',
      width: '42%',
    },
    skewX: '-8deg',
    template: 'resources://news/welcome/welcome-fut.png',
    textColor: '#e10001',
  },
  liquid: {
    aliases: ['team-liquid'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '57%',
      maxWidth: '42%',
    },
    fontFamily: 'AMARANTH',
    fontSize: '5.7rem',
    letterSpacing: '-5px',
    nameLayout: {
      left: '25.5%',
      top: '44%',
      width: '45%',
    },
    template: 'resources://news/welcome/welcome-liquid.png',
    textColor: '#f4f5f7',
  },
  b8: {
    aspectRatio: '16 / 9',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '55%',
      maxWidth: '43%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.5rem',
    nameLayout: {
      left: '27%',
      top: '75%',
      width: '42%',
    },
    template: 'resources://news/welcome/welcome-b8.png',
    textColor: '#d2d0d2',
  },
  big: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '102%',
      left: '3%',
      maxWidth: '42%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.8rem',
    fontStyle: 'italic',
    nameLayout: {
      left: '69%',
      top: '86%',
      width: '42%',
    },
    skewX: '-8deg',
    template: 'resources://news/welcome/welcome-big.png',
    textColor: '#ffffff',
  },
  pain: {
    aliases: ['pain-gaming'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '56%',
      maxWidth: '42%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.4rem',
    fontStyle: 'italic',
    nameLayout: {
      left: '30%',
      top: '87%',
      width: '42%',
    },
    skewX: '-8deg',
    template: 'resources://news/welcome/welcome-pain.png',
    textColor: '#dededf',
  },
  gamerlegion: {
    aliases: ['gamer-legion'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '55%',
      maxWidth: '42%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.5rem',
    nameLayout: {
      left: '30%',
      top: '80%',
      width: '42%',
    },
    template: 'resources://news/welcome/welcome-gamerlegion.png',
    textColor: '#171818',
  },
  nrg: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '57%',
      maxWidth: '42%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.7rem',
    fontStyle: 'italic',
    nameLayout: {
      left: '29%',
      top: '81.5%',
      width: '42%',
    },
    skewX: '-8deg',
    template: 'resources://news/welcome/welcome-nrg.png',
    textColor: '#fd430e',
  },
  heroic: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '108%',
      left: '31%',
      maxWidth: '39%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.3rem',
    fontStyle: 'italic',
    nameLayout: {
      left: '50%',
      top: '87%',
      width: '50%',
    },
    skewX: '-8deg',
    template: 'resources://news/welcome/welcome-heroic.png',
    textColor: '#ffffff',
    textStroke: '1px #cc0910',
  },
  fnatic: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '61%',
      maxWidth: '39%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.9rem',
    nameLayout: {
      left: '37%',
      top: '73.5%',
      width: '45%',
    },
    template: 'resources://news/welcome/welcome-fnatic.png',
    textColor: '#282828',
    textStroke: '1px #db601c',
  },
  flyquest: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '50%',
      maxWidth: '39%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.6rem',
    nameLayout: {
      left: '25.5%',
      top: '80%',
      width: '40%',
    },
    template: 'resources://news/welcome/welcome-flyquest.png',
    textColor: '#ffffff',
  },
  m80: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '62%',
      maxWidth: '39%',
    },
    fontFamily: 'CAPTURE IT',
    fontSize: '5.35rem',
    nameLayout: {
      left: '41%',
      top: '85%',
      width: '44%',
    },
    template: 'resources://news/welcome/welcome-m80.png',
    textColor: '#cce203',
  },
  legacy: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '49%',
      maxWidth: '41%',
    },
    fontFamily: 'JUNEVILLE',
    fontSize: '5.1rem',
    nameLayout: {
      left: '24%',
      top: '88%',
      width: '38%',
    },
    template: 'resources://news/welcome/welcome-legacy.png',
    textColor: '#ecb301',
  },
  imperial: {
    aliases: ['imperial-esports'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '55%',
      maxWidth: '42%',
    },
    fontFamily: 'NATURE FORCE',
    fontSize: '4.35rem',
    nameLayout: {
      left: '20%',
      top: '83.5%',
      width: '36%',
    },
    template: 'resources://news/welcome/welcome-imperial.png',
    textColor: '#01f77a',
  },
  monte: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '55%',
      maxWidth: '42%',
    },
    fontFamily: 'BEORNHEARD',
    fontSize: '4.35rem',
    fontStyle: 'italic',
    nameLayout: {
      left: '24%',
      top: '90%',
      width: '37%',
    },
    skewX: '-8deg',
    template: 'resources://news/welcome/welcome-monte.png',
    textColor: '#e5e5e5',
  },
  mibr: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '50%',
      maxWidth: '40%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '5.2rem',
    nameLayout: {
      left: '93%',
      top: '50%',
      width: '44%',
    },
    rotate: '90deg',
    template: 'resources://news/welcome/welcome-mibr.png',
    textColor: '#ffffff',
  },
  tyloo: {
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '58%',
      maxWidth: '41%',
    },
    fontFamily: 'CAPTURE IT',
    fontSize: '4.9rem',
    nameLayout: {
      left: '24%',
      top: '82%',
      width: '40%',
    },
    template: 'resources://news/welcome/welcome-tyloo.png',
    textColor: '#ffffff',
  },
  passionua: {
    aliases: ['passion-ua'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '59%',
      maxWidth: '42%',
    },
    fontFamily: 'BEBAS NEUE',
    fontSize: '5.6rem',
    nameLayout: {
      left: '16%',
      top: '82%',
      width: '40%',
    },
    template: 'resources://news/welcome/welcome-passionua.png',
    textColor: '#ffffff',
    textStroke: '1px #095cff',
  },
  vitality: {
    aliases: ['team-vitality'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '118%',
      left: '48%',
      maxWidth: '44%',
    },
    fontFamily: 'STAATLICHES',
    fontSize: '4.85rem',
    letterSpacing: '-5px',
    nameLayout: {
      left: '20.5%',
      top: '68%',
      width: '31%',
    },
    template: 'resources://news/welcome/welcome-vitality.png',
    textColor: '#000000',
    textShadow: false,
  },
  bcgame: {
    aliases: ['bc-game', 'bc-game-esports'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '58%',
      maxWidth: '42%',
    },
    fontFamily: 'BEORNHEARD',
    fontSize: '4.9rem',
    fontStyle: 'italic',
    nameLayout: {
      left: '31%',
      top: '77%',
      width: '40%',
    },
    skewX: '-8deg',
    template: 'resources://news/welcome/welcome-bcgame.png',
    textColor: '#00ca61',
  },
  nip: {
    aliases: ['ninjas-in-pyjamas', 'ninjas-in-pajamas'],
    aspectRatio: '1672 / 941',
    avatarLayout: {
      bottom: '0%',
      height: '101%',
      left: '58%',
      maxWidth: '42%',
    },
    fontFamily: 'BEORNHEARD',
    fontSize: '4.8rem',
    nameLayout: {
      left: '30.5%',
      top: '70.5%',
      width: '38%',
    },
    template: 'resources://news/welcome/welcome-nip.png',
    textColor: '#cef102',
  },
};

function normalizeTemplateKey(value?: string | null) {
  return (
    value
      ?.toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || null
  );
}

function getPlayerName(player?: WelcomeGraphicPlayer | null) {
  return player?.name || 'an emerging player';
}

function getWelcomeGraphicTemplate(team?: WelcomeGraphicTeam | null) {
  const candidates = [team?.slug, team?.name].map(normalizeTemplateKey).filter(Boolean) as string[];
  const directMatch = candidates.find((candidate) => WELCOME_GRAPHIC_TEMPLATES[candidate]);

  if (directMatch) {
    return {
      key: directMatch,
      template: WELCOME_GRAPHIC_TEMPLATES[directMatch],
    };
  }

  const aliasMatch = Object.entries(WELCOME_GRAPHIC_TEMPLATES).find(([key, template]) =>
    candidates.some(
      (candidate) =>
        candidate === key ||
        candidate.startsWith(`${key}-`) ||
        template.aliases?.some((alias) => candidate === alias || candidate.startsWith(`${alias}-`)),
    ),
  );

  return aliasMatch
    ? {
        key: aliasMatch[0],
        template: aliasMatch[1],
      }
    : null;
}

export function getWelcomeGraphic(
  team: WelcomeGraphicTeam | null | undefined,
  player: WelcomeGraphicPlayer | null | undefined,
) {
  const match = getWelcomeGraphicTemplate(team);

  return match
    ? {
        ...match.template,
        avatar: player?.avatar || 'resources://avatars/empty.png',
        playerName: getPlayerName(player).toLocaleUpperCase(),
        teamSlug: match.key,
      }
    : null;
}

export function getThankYouGraphic(
  team: WelcomeGraphicTeam | null | undefined,
  player: WelcomeGraphicPlayer | null | undefined,
) {
  const match = getWelcomeGraphicTemplate(team);

  return match
    ? {
        ...match.template,
        avatar: player?.avatar || 'resources://avatars/empty.png',
        playerName: getPlayerName(player).toLocaleUpperCase(),
        teamSlug: match.key,
        template: match.template.template.replace(
          /resources:\/\/news\/welcome\/welcome-/,
          'resources://news/thankyou/thankyou-',
        ),
      }
    : null;
}
