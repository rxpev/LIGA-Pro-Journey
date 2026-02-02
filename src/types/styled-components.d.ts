import 'styled-components';

declare module 'styled-components' {
  export interface DefaultTheme {
    fontFamily: string;

    textColor: {
      dark: string;
      main: string;
      highlighted: string;
    };

    matchBackground: {
      wonColor: string;
      lostColor: string;
    };

    score: {
      background: {
        wonColor: string;
        lostColor: string;
      };
      text: {
        highlightedWonColor: string;
        highlightedLostColor: string;
      };
    };

    border: {
      color: string;
      highlightedColor: string;
    };

    transitionTimingFunction: string;
    smooth: string;
  }
}
