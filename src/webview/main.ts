import {
  provideVSCodeDesignSystem,
  vsCodeLink,
  vsCodeProgressRing
} from "@vscode/webview-ui-toolkit";
provideVSCodeDesignSystem().register(vsCodeLink(), vsCodeProgressRing());
