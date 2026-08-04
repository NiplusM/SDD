import openAiIconUrl from './assets/openAI.svg';
import githubCopilotIconUrl from './assets/github-copilot.svg';

export function AiChatClaudeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="icon ai-chat-agent-mark">
      <path d="M3.74684 10.3074L6.50076 8.76322L6.54684 8.62864L6.50076 8.55426H6.36608L5.90532 8.52593L4.33165 8.48343L2.96709 8.42676L1.64506 8.35593L1.3119 8.2851L1 7.87427L1.0319 7.66886L1.3119 7.48115L1.71241 7.51657L2.59848 7.57678L3.92759 7.66886L4.89165 7.72553L6.32 7.87427H6.54684L6.57873 7.78219L6.50076 7.72553L6.44051 7.66886L5.06532 6.73741L3.57671 5.75285L2.79696 5.18619L2.37519 4.89932L2.16253 4.63015L2.07038 4.04225L2.45316 3.62079L2.96709 3.65621L3.09823 3.69163L3.61924 4.09183L4.73215 4.95244L6.18532 6.02201L6.39797 6.19909L6.48304 6.13888L6.49367 6.09638L6.39797 5.93701L5.6076 4.50974L4.76405 3.05768L4.38835 2.4556L4.28911 2.09436C4.25367 1.94561 4.22886 1.82165 4.22886 1.66937L4.66481 1.07792L4.90582 1L5.48709 1.07792L5.73165 1.29041L6.09316 2.11561L6.67797 3.41538L7.58532 5.18265L7.85114 5.70681L7.99291 6.19201L8.04608 6.34075H8.13823V6.25576L8.21266 5.26056L8.35089 4.0387L8.48557 2.46623L8.53165 2.02353L8.75139 1.49228L9.18734 1.20541L9.5276 1.36833L9.80759 1.76853L9.76861 2.02707L9.60203 3.10726L9.27595 4.80015L9.06329 5.93347H9.18734L9.32911 5.7918L9.90329 5.03036L10.8673 3.82621L11.2927 3.34809L11.7889 2.82039L12.1078 2.56893H12.7104L13.1534 3.22768L12.9549 3.90767L12.3347 4.6939L11.8208 5.35973L11.0835 6.35138L10.6228 7.1447L10.6653 7.20845L10.7752 7.19782L12.441 6.84366L13.3413 6.68075L14.4152 6.49659L14.9008 6.72325L14.9539 6.95345L14.7625 7.42449L13.6142 7.70782L12.2673 7.97698L10.2613 8.45156L10.2365 8.46926L10.2648 8.50468L11.1686 8.58968L11.5549 8.61093H12.5013L14.2628 8.74197L14.7235 9.04655L15 9.41842L14.9539 9.70175L14.2451 10.063L13.2881 9.83633L11.0552 9.30508L10.2896 9.11384H10.1833V9.17759L10.8213 9.80091L11.9909 10.8563L13.4547 12.2163L13.5291 12.5527L13.3413 12.8184L13.1428 12.79L11.8562 11.8232L11.36 11.3876L10.2365 10.4419H10.162V10.5411L10.4208 10.9201L11.7889 12.9742L11.8597 13.6046L11.7605 13.81L11.4061 13.934L11.0162 13.8631L10.2152 12.7405L9.38937 11.4761L8.72304 10.3428L8.64152 10.3888L8.2481 14.621L8.0638 14.8371L7.63848 15L7.28405 14.7308L7.0962 14.2952L7.28405 13.4346L7.51089 12.3119L7.69519 11.4194L7.86177 10.3109L7.96101 9.94258L7.95392 9.91778L7.8724 9.92841L7.03595 11.0759L5.76354 12.7936L4.75696 13.8702L4.51595 13.9658L4.09772 13.7498L4.13671 13.3638L4.37063 13.0202L5.76354 11.2494L6.60354 10.1515L7.14582 9.51758L7.14228 9.4255H7.11038L3.41013 11.8267L2.75089 11.9117L2.46734 11.6461L2.50278 11.2105L2.63747 11.0688L3.75038 10.3038L3.74684 10.3074Z" fill="#D97757" />
    </svg>
  );
}

export function AiChatJunieIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="icon ai-chat-agent-mark">
      <path d="M10.3688 5.66605H15.0369V6.44407C15.0369 11.8883 12.7028 15.0004 6.48051 15.0004H5.70251V10.3323H6.48051C9.2036 10.3323 10.3707 9.16525 10.3707 6.44216V5.66414L10.3688 5.66605Z" fill="#48E054" />
      <path d="M5.66815 5.66602H1V10.3342H5.66815V5.66602Z" fill="#48E054" />
      <path d="M10.3364 1H5.66821V5.66815H10.3364V1Z" fill="#48E054" />
    </svg>
  );
}

// The real OpenAI mark, same asset the AIUX-550 prototype ships
// (int-ui-prototypes/src/assets/openAI.svg) — keeps the tab, the chat list and the
// session picker on one icon instead of a hand-drawn stand-in.
export function AiChatCodexIcon({ className = '' }) {
  return (
    <img
      src={openAiIconUrl}
      alt=""
      width="16"
      height="16"
      aria-hidden="true"
      data-agent="codex"
      className={`icon ai-chat-codex-mark ${className}`.trim()}
    />
  );
}

export function AiChatGeminiIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="icon ai-chat-agent-mark">
      <path d="M8 1.25c.38 3.3 3.45 6.37 6.75 6.75C11.45 8.38 8.38 11.45 8 14.75 7.62 11.45 4.55 8.38 1.25 8 4.55 7.62 7.62 4.55 8 1.25Z" fill="#8AB4F8" />
    </svg>
  );
}

// Same for GitHub Copilot: the prototype's github-copilot.svg.
export function AiChatCopilotIcon({ className = '' }) {
  return (
    <img
      src={githubCopilotIconUrl}
      alt=""
      width="16"
      height="16"
      aria-hidden="true"
      data-agent="copilot"
      className={`icon ai-chat-agent-mark ${className}`.trim()}
    />
  );
}

function AiChatMarkdownFileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M12.5929 9.9438L12.5929 4.70001L13.7929 4.70002L13.7929 9.94379L15.0763 8.66037L15.9248 9.5089L13.1929 12.2409L10.4609 9.5089L11.3095 8.66037L12.5929 9.9438Z" fill="#9B6BDA" />
      <path d="M0.5 4.70001H2.94558L4.65385 9.14463L4.76288 9.60155L4.85635 9.14463L6.51269 4.70001H8.98423V11.9692H7.14096V7.59732L7.17212 7.12482L5.34442 11.9692H4.08269L2.31212 7.17155L2.34327 7.59732V11.9692H0.5V4.70001Z" fill="#9B6BDA" />
    </svg>
  );
}

export function AiChatAgentIcon({ icon = 'claude', title = '' }) {
  const normalizedIcon = typeof icon === 'string' ? icon : '';
  const normalizedTitle = typeof title === 'string' ? title : '';
  if (normalizedIcon === 'junie') return <AiChatJunieIcon />;
  if (normalizedIcon === 'codex') return <AiChatCodexIcon />;
  if (normalizedIcon === 'gemini') return <AiChatGeminiIcon />;
  if (normalizedIcon === 'copilot') return <AiChatCopilotIcon />;
  if (normalizedIcon === 'fileTypes/markdown' || normalizedTitle.endsWith('.md')) return <AiChatMarkdownFileIcon />;
  return <AiChatClaudeIcon />;
}

export function AiChatListLeading({ title, icon = 'claude' }) {
  return (
    <>
      <span className="ai-chat-list-agent-icon">
        <AiChatAgentIcon icon={icon} title={title} />
      </span>
      <span className="ai-chat-list-title">{title}</span>
    </>
  );
}
