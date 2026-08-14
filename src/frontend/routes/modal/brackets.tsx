/**
 * Dedicated modal for brackets.
 *
 * @module
 */
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Constants, Eagers } from '@liga/shared';
import { Brackets } from '@liga/frontend/components';

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
          onMatchClick={(match) => navigate('/postgame', { state: match.id })}
          onPartyClick={(party) => {
            api.window.send<ModalRequest>(Constants.WindowIdentifier.Main, {
              target: `/teams?teamId=${party.id}`,
            });
            api.window.close(Constants.WindowIdentifier.Modal);
          }}
        />
      )}
    </main>
  );
}
