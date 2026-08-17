/**
 * Dedicated modal for brackets.
 *
 * @module
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Constants, Eagers } from '@liga/shared';
import { Brackets, MatchPreviewModal } from '@liga/frontend/components';

/**
 * Exports this module.
 *
 * @exports
 */
export default function () {
  const location = useLocation();
  const navigate = useNavigate();
  const [bracket, setBracket] = React.useState<
    Awaited<ReturnType<typeof api.matches.all<typeof Eagers.match>>>
  >([]);
  const [previewMatchId, setPreviewMatchId] = React.useState<number>();
  const [previewPosition, setPreviewPosition] = React.useState({ x: 0, y: 0 });

  // fetch data when viewing bracket
  React.useEffect(() => {
    if (!location.state) {
      return;
    }

    api.matches
      .all({
        where: {
          competitionId: location.state as number,
        },
        include: Eagers.match.include,
      })
      .then(setBracket);
  }, []);

  return (
    <main className="h-screen w-screen">
      {!bracket.length && (
        <section className="center h-full">
          <span className="loading loading-bars" />
        </section>
      )}
      {!!bracket.length && (
        <Brackets
          matches={bracket}
          onMatchClick={(match, position) => {
            setPreviewMatchId(match.id);
            setPreviewPosition(position);
          }}
          onPartyClick={(party) => {
            api.window.send<ModalRequest>(Constants.WindowIdentifier.Main, {
              target: `/teams?teamId=${party.id}`,
            });
            api.window.close(Constants.WindowIdentifier.Modal);
          }}
        />
      )}
      {previewMatchId != null && (
        <MatchPreviewModal
          matchId={previewMatchId}
          position={previewPosition}
          onClose={() => setPreviewMatchId(undefined)}
          onTeamClick={(teamId) => {
            api.window.send<ModalRequest>(Constants.WindowIdentifier.Main, {
              target: `/teams?teamId=${teamId}`,
            });
            api.window.close(Constants.WindowIdentifier.Modal);
          }}
          onPlayerClick={(playerId) => {
            setPreviewMatchId(undefined);
            navigate('/transfer', { state: playerId });
          }}
          onOpenMatch={() => navigate('/postgame', { state: previewMatchId })}
        />
      )}
    </main>
  );
}
