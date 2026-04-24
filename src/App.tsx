import { useEffect } from 'react';
import { useAppStore } from '@/stores/appStore';
import { useConfigStore } from '@/stores/configStore';
import { useNav } from '@/hooks/useNav';
import { BootstrapWizard } from '@/components/setup/BootstrapWizard';
import { MatchList } from '@/components/matches/MatchList';
import { NewMatchDialog } from '@/components/matches/NewMatchDialog';
import { ImportDvwDialog } from '@/components/matches/ImportDvwDialog';
import { ScoutingView } from '@/components/scouting/ScoutingView';
import { FormationSetupView } from '@/components/setup/FormationSetupView';
import { ConfigEditor } from '@/components/config/ConfigEditor';
import { TeamsView } from '@/components/teams/TeamsView';
import '@/styles/app.css';
import '@/styles/config.css';
import '@/styles/formation.css';
import '@/styles/teams.css';

type AppView = 'home' | 'new_match' | 'import_dvw' | 'scouting' | 'formation_setup' | 'config' | 'teams';

export function App() {
  const { isBootstrapped, isLoading, orgId, seasonId, init } = useAppStore();
  const { init: initConfig } = useConfigStore();
  const { view, matchId, navigate, back } = useNav<AppView>();

  useEffect(() => { init(); }, [init]);
  useEffect(() => {
    if (orgId) initConfig(orgId, seasonId ?? undefined);
  }, [orgId, seasonId, initConfig]);

  if (isLoading) return <div className="app-loading">Avvio in corso…</div>;
  if (!isBootstrapped) return <BootstrapWizard />;

  const matchListBase = (
    <MatchList
      onSelect={id => navigate('scouting', id)}
      onNew={() => navigate('new_match')}
      onConfig={() => navigate('config')}
      onTeams={() => navigate('teams')}
      onImport={() => navigate('import_dvw')}
    />
  );

  switch (view) {
    case 'scouting':
      return <ScoutingView matchId={matchId!} onBack={back} />;

    case 'formation_setup':
      return (
        <FormationSetupView
          matchId={matchId!}
          onDone={id => navigate('scouting', id)}
          onBack={back}
        />
      );

    case 'config':
      return <ConfigEditor orgId={orgId!} onClose={back} />;

    case 'teams':
      return <TeamsView onClose={back} />;

    case 'new_match':
      return (
        <>
          {matchListBase}
          <NewMatchDialog onCreated={id => navigate('formation_setup', id)} onCancel={back} />
        </>
      );

    case 'import_dvw':
      return (
        <>
          {matchListBase}
          <ImportDvwDialog onImported={id => navigate('scouting', id)} onCancel={back} />
        </>
      );

    default:
      return matchListBase;
  }
}
