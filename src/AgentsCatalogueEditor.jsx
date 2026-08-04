// Agents catalogue editor tab. Ported from the AIUX-550 final-4 prototype
// (JetBrains/aia-design → int-ui-prototypes/src/designers/tanya/AIUX-550-Final4/index.jsx:6501-6637).
import { Icon, IconButton, ProgressBar } from '@jetbrains/int-ui-kit';
import { FinalChoiceIcon } from './FinalPresetParts.jsx';
import {
  getAgentCatalogueSections,
  startAgentInstall,
  useAgentInstallState,
} from './finalPresetModel.js';

function AgentCatalogueIcon({ agentId, size = 32 }) {
  return <FinalChoiceIcon option={{ agentId }} size={size} />;
}

function AgentCatalogueInstalledCard({ agent }) {
  return (
    <article className="aiux550f4-final-agent-catalogue-card">
      <div className="aiux550f4-final-agent-catalogue-card-content">
        <AgentCatalogueIcon agentId={agent.id} size={20} />
        <div className="aiux550f4-final-agent-catalogue-card-copy">
          <strong>{agent.name}</strong>
          <span>{agent.version}</span>
        </div>
      </div>
      <div className="aiux550f4-final-agent-catalogue-card-actions">
        {agent.updateTo ? (
          <button
            type="button"
            className="aiux550f4-final-agent-catalogue-card-update"
            aria-label={`Update ${agent.name} from ${agent.version} to ${agent.updateTo}`}
          >
            <Icon name="general/pluginUpdate" size={16} />
            <span>
              {agent.version} → {agent.updateTo}
            </span>
          </button>
        ) : null}
        <IconButton icon="general/moreVertical" tooltip={`More actions for ${agent.name}`} />
      </div>
    </article>
  );
}

function AgentCatalogueAvailableRow({ agent, installProgress }) {
  const installing = installProgress !== undefined;

  return (
    <article className="aiux550f4-final-agent-catalogue-row">
      <AgentCatalogueIcon agentId={agent.id} />
      <div className="aiux550f4-final-agent-catalogue-copy">
        <div className="aiux550f4-final-agent-catalogue-name-line">
          <strong>{agent.name}</strong>
          <span>{agent.version}</span>
          {agent.bundled ? <em>Bundled</em> : null}
        </div>
        <p>{agent.description}</p>
        <span className="aiux550f4-final-agent-catalogue-author">{agent.author} ↗</span>
      </div>
      {installing ? (
        <div className="aiux550f4-final-agent-catalogue-install-progress">
          <ProgressBar value={installProgress} max={100} label="Downloading…" />
        </div>
      ) : (
        <button
          type="button"
          className="aiux550f4-final-agent-catalogue-action"
          onClick={() => startAgentInstall(agent.id)}
        >
          Install
        </button>
      )}
    </article>
  );
}

export function AgentsCatalogueEditor() {
  const { installed, installing } = useAgentInstallState();
  const sections = getAgentCatalogueSections(installed);

  return (
    <div className="aiux550f4-final-agent-catalogue-editor" aria-label="Agents catalogue">
      <div className="aiux550f4-final-agent-catalogue-body">
        <div className="aiux550f4-final-agent-catalogue-search">
          <Icon name="general/search" size={16} />
          <input type="text" placeholder="Search agents..." aria-label="Search agents" />
          <button
            type="button"
            className="aiux550f4-final-agent-catalogue-search-clear"
            aria-label="Clear search"
          >
            <Icon name="general/closeSmall" size={16} />
          </button>
        </div>

        <div className="aiux550f4-final-agent-catalogue-sections">
          {sections.map((section) => {
            const isInstalledSection = section.id === 'installed';
            const updatableCount = section.agents.filter((agent) => agent.updateTo).length;

            return (
              <section
                className={`aiux550f4-final-agent-catalogue-section ${isInstalledSection ? 'installed' : ''}`.trim()}
                key={section.id}
                aria-label={`${section.title} agents`}
              >
                <header className="aiux550f4-final-agent-catalogue-section-header">
                  <h3>{section.title}</h3>
                  <span className="aiux550f4-final-agent-catalogue-section-rule" aria-hidden="true" />
                  {isInstalledSection && updatableCount ? (
                    <button
                      type="button"
                      className="aiux550f4-final-agent-catalogue-update-all"
                      aria-label={`Update all ${updatableCount} installed agents`}
                    >
                      Update all {updatableCount}
                    </button>
                  ) : null}
                </header>
                <div className="aiux550f4-final-agent-catalogue-grid">
                  {section.agents.map((agent) => (
                    isInstalledSection ? (
                      <AgentCatalogueInstalledCard agent={agent} key={`${section.id}-${agent.id}`} />
                    ) : (
                      <AgentCatalogueAvailableRow
                        agent={agent}
                        installProgress={installing[agent.id]}
                        key={`${section.id}-${agent.id}`}
                      />
                    )
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <footer className="aiux550f4-final-agent-catalogue-footer">
        <a href="#" onClick={(event) => event.preventDefault()}>
          Powered by ACP ↗
        </a>
      </footer>
    </div>
  );
}
