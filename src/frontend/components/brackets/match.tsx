/**
 * Custom bracket match component with team logos.
 *
 * @module
 */
import React from 'react';
import styled, { css } from 'styled-components';
import type { MatchComponentProps } from '@g-loot/react-tournament-brackets/dist/esm';

type AnchorProps = {
  font?: string;
  bold?: boolean;
  size?: string;
};

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: stretch;
  height: 100%;
  font-family: ${({ theme }) => theme.fontFamily};
`;

const TopText = styled.p`
  color: ${({ theme }) => theme.textColor.dark};
  margin-bottom: 0.2rem;
  min-height: 1.25rem;
`;

const BottomText = styled.p`
  color: ${({ theme }) => theme.textColor.dark};
  flex: 0 0 none;
  text-align: center;
  margin-top: 0.2rem;
  min-height: 1.25rem;
`;

const StyledMatch = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  justify-content: space-between;
`;

const Team = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
`;

const Logo = styled.img`
  width: 0.9rem;
  height: 0.9rem;
  object-fit: contain;
`;

const Score = styled.div<{ won?: boolean }>`
  display: flex;
  height: 100%;
  padding: 0 1rem;
  align-items: center;
  width: 20%;
  justify-content: center;
  background: ${({ theme, won }) =>
    won ? theme.score.background.wonColor : theme.score.background.lostColor};
  color: ${({ won }) =>
    won === undefined ? 'var(--color-base-content)' : won ? 'var(--color-success)' : 'var(--color-error)'};
`;

const Side = styled.button<{ won?: boolean; hovered?: boolean }>`
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 0 0 0 1rem;
  background: ${({ theme, won }) =>
    won ? theme.matchBackground.wonColor : theme.matchBackground.lostColor};

  border-right: 4px solid ${({ theme }) => theme.border.color};
  border-left: 4px solid ${({ theme }) => theme.border.color};
  border-top: 1px solid ${({ theme }) => theme.border.color};
  border-bottom: 1px solid ${({ theme }) => theme.border.color};

  transition: border-color 0.5s ${({ theme }) => theme.transitionTimingFunction};
  ${Team} {
    color: ${({ theme, won }) =>
    won ? theme.textColor.highlighted : theme.textColor.dark};
  }
  ${Score} {
    color: ${({ won }) =>
    won === undefined ? 'var(--color-base-content)' : won ? 'var(--color-success)' : 'var(--color-error)'};
  }
  ${({ hovered, theme, won }) =>
    hovered &&
    css`
      border-color: ${theme.border.highlightedColor};
      ${Team} {
        color: ${theme.textColor.highlighted};
      }
      ${Score} {
        color: ${won === undefined
        ? 'var(--color-base-content)'
        : won
          ? 'var(--color-success)'
          : 'var(--color-error)'};
      }
    `}
`;

const Line = styled.div<{ highlighted?: boolean }>`
  height: 1px;
  transition: border-color 0.5s ${({ theme }) => theme.smooth};

  border-width: 1px;
  border-style: solid;
  border-color: ${({ highlighted, theme }) =>
    highlighted ? theme.border.highlightedColor : theme.border.color};
`;

const Anchor = styled.a<AnchorProps>`
  font-family: ${({ font, theme }) => font || theme.fontFamily};
  font-weight: ${({ bold }) => (bold ? '700' : '400')};
  color: ${({ theme }) => theme.textColor.main};
  font-size: ${({ size }) => (size ? size : '1rem')};
  line-height: 1.375rem;
  text-decoration: none;
  cursor: pointer;
  background: none;
  border: none;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
`;

function renderTeamName(party: MatchComponentProps['topParty'], fallback: string) {
  const name = party?.name ?? fallback;
  const logo = (party as MatchComponentProps['topParty'] & { logo?: string }).logo;

  return (
    <Team>
      {logo && <Logo src={logo} alt={typeof name === 'string' ? name : 'Team logo'} />}
      {name}
    </Team>
  );
}

/**
 * Exports this module.
 *
 * @param props Root props.
 * @component
 * @exports
 */
export function TeamLogoMatch({
  bottomHovered,
  bottomParty,
  bottomText,
  bottomWon,
  match,
  onMatchClick,
  onMouseEnter,
  onMouseLeave,
  onPartyClick,
  topHovered,
  topParty,
  topText,
  topWon,
  teamNameFallback,
  resultFallback,
}: MatchComponentProps) {
  return (
    <Wrapper>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <TopText>{topText}</TopText>
        {(match.href || typeof onMatchClick === 'function') && (
          <Anchor
            href={match.href || '#'}
            onClick={(event: React.MouseEvent<HTMLAnchorElement>) => {
              // if there's no real href, prevent a jump to "#"
              if (!match.href) event.preventDefault();

              onMatchClick?.({
                match,
                topWon,
                bottomWon,
                event,
              });
            }}
          >
            <TopText>Match Details</TopText>
          </Anchor>
        )}
      </div>
      <StyledMatch>
        <Side
          type="button"
          onMouseEnter={() => onMouseEnter(topParty.id)}
          onMouseLeave={onMouseLeave}
          won={topWon}
          hovered={topHovered}
          onClick={() => onPartyClick?.(topParty, topWon)}
        >
          {renderTeamName(topParty, teamNameFallback)}
          <Score won={topWon}>
            {topParty?.resultText ?? resultFallback(topParty)}
          </Score>
        </Side>
        <Line highlighted={topHovered || bottomHovered} />
        <Side
          type="button"
          onMouseEnter={() => onMouseEnter(bottomParty.id)}
          onMouseLeave={onMouseLeave}
          won={bottomWon}
          hovered={bottomHovered}
          onClick={() => onPartyClick?.(bottomParty, bottomWon)}
        >
          {renderTeamName(bottomParty, teamNameFallback)}
          <Score won={bottomWon}>
            {bottomParty?.resultText ?? resultFallback(bottomParty)}
          </Score>
        </Side>
      </StyledMatch>
      <BottomText>{bottomText ?? ' '}</BottomText>
    </Wrapper>
  );
}
