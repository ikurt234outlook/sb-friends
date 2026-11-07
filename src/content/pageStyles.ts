export const pageStyles = `
:root {
  --sb-friend-text: #386850;
  --sb-friend-bg: #edf4ef;
  --sb-friend-hover: #e0ece4;
  --sb-friend-border: #bdcfc3;
  --sb-friend-dot: #648f75;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-color-scheme-dark-mode-theme="light"]):not([data-dark-mode-theme="light"]) {
    --sb-friend-text: #a2c9af;
    --sb-friend-bg: #21352b;
    --sb-friend-hover: #2b4436;
    --sb-friend-border: #3e5e4b;
    --sb-friend-dot: #83b493;
  }
}
:root[data-color-scheme-dark-mode-theme="dark"],
:root[data-dark-mode-theme="dark"] {
  --sb-friend-text: #a2c9af;
  --sb-friend-bg: #21352b;
  --sb-friend-hover: #2b4436;
  --sb-friend-border: #3e5e4b;
  --sb-friend-dot: #83b493;
}
button.sb-friend-mark.sb-friend-mark {
  all: unset;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  color: var(--sb-friend-text);
  font: 11px/1.5 system-ui, sans-serif;
  white-space: nowrap;
  vertical-align: baseline;
  cursor: pointer;
}
button.sb-friend-mark.sb-friend-mark::before {
  content: "";
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--sb-friend-dot);
}
button.sb-friend-mark.sb-friend-mark:hover { text-decoration: underline; }
button.sb-friends-action.sb-friends-action {
  box-sizing: border-box;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  padding: 5px 10px;
  border: 1px solid var(--sb-friend-border);
  border-radius: 4px;
  background: var(--sb-friend-bg);
  color: var(--sb-friend-text);
  box-shadow: none;
  cursor: pointer;
  font: 13px/1.5 system-ui, sans-serif;
  text-align: center;
}
button.sb-friends-action.sb-friends-action:hover { background: var(--sb-friend-hover); }
button.sb-friends-action.sb-friends-action:disabled { opacity: .6; cursor: wait; }
#sb-friends-profile-action {
  width: calc(100% - 28px);
  height: 38px;
  margin: 0 14px 14px;
}
button.sb-friend-mark:focus-visible, button.sb-friends-action:focus-visible {
  outline: 2px solid var(--sb-friend-dot);
  outline-offset: 3px;
}
#sb-friends-launcher.sb-floating {
  position: fixed;
  right: 18px;
  bottom: 24px;
  z-index: 10000;
}
`;
