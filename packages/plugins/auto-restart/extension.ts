import SQLTools from '@sqltools/core/plugin-api';
import { CloseAction } from 'vscode-languageclient';
import { ExitCalledNotification } from './contracts';

let avoidRestart = false;

const AutoRestartPlugin: SQLTools.ExtensionPlugin = {
  register(extension) {
    const defaultHandler = extension.client.clientErrorHandler;
    extension.client.clientErrorHandler = {
      error: defaultHandler.error,
      closed: (): CloseAction => {
        if (avoidRestart) {
          return CloseAction.DoNotRestart;
        }
        return defaultHandler.closed();
      },
    };

    extension.client.onNotification(ExitCalledNotification, () => {
      this.avoidRestart = true;
    });
  }
}

export default AutoRestartPlugin;