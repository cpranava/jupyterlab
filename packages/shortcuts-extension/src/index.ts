// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JupyterLab, JupyterLabPlugin } from '@jupyterlab/application';

import { ISettingRegistry, Settings } from '@jupyterlab/coreutils';

import { CommandRegistry } from '@phosphor/commands';

import { ReadonlyJSONObject, ReadonlyJSONValue } from '@phosphor/coreutils';

import { DisposableSet, IDisposable } from '@phosphor/disposable';

/**
 * The default shortcuts extension.
 *
 * #### Notes
 * Shortcut values are stored in the setting system. The default values for each
 * shortcut are preset in the settings schema file of this extension.
 * Additionally, each shortcut can be individually set by the end user by
 * modifying its setting (either in the text editor or by modifying its
 * underlying JSON schema file).
 *
 * When setting shortcut selectors, there are two concepts to consider:
 * specificity and matchability. These two interact in sometimes
 * counterintuitive ways. Keyboard events are triggered from an element and
 * they propagate up the DOM until they reach the `documentElement` (`<body>`).
 *
 * When a registered shortcut sequence is fired, the shortcut manager checks
 * the node that fired the event and each of its ancestors until a node matches
 * one or more registered selectors. The *first* matching selector in the
 * chain of ancestors will invoke the shortcut handler and the traversal will
 * end at that point. If a node matches more than one selector, the handler for
 * whichever selector is more *specific* fires.
 * @see https://www.w3.org/TR/css3-selectors/#specificity
 *
 * The practical consequence of this is that a very broadly matching selector,
 * e.g. `'*'` or `'div'` may match and therefore invoke a handler *before* a
 * more specific selector. The most common pitfall is to use the universal
 * (`'*'`) selector. For almost any use case where a global keyboard shortcut is
 * required, using the `'body'` selector is more appropriate.
 */
const plugin: JupyterLabPlugin<void> = {
  id: '@jupyterlab/shortcuts-extension:plugin',
  requires: [ISettingRegistry],
  activate: async (app: JupyterLab, registry: ISettingRegistry) => {
    const { commands } = app;

    // Transform the settings object to return different annotated defaults
    // calculated from all the keyboard shortcuts in the registry instead of
    // using the default values from this plugin's schema.
    registry.transform(plugin.id, Private.transform(commands, registry));

    try {
      const settings = await registry.load(plugin.id);
      Private.loadShortcuts(commands, settings.composite);
      settings.changed.connect(() => {
        Private.loadShortcuts(commands, settings.composite);
      });
    } catch (error) {
      console.error('Loading shortcut settings failed.', error.message);
    }
  },
  autoStart: true
};

/**
 * Export the plugin as default.
 */
export default plugin;

/**
 * A namespace for private module data.
 */
namespace Private {
  /**
   * The internal collection of currently loaded shortcuts.
   */
  let disposables: IDisposable;

  /**
   * Load the keyboard shortcuts from settings.
   */
  export function loadShortcuts(
    commands: CommandRegistry,
    composite: ReadonlyJSONObject
  ): void {
    if (disposables) {
      disposables.dispose();
    }
    disposables = Object.keys(composite).reduce((acc, val): DisposableSet => {
      const options = normalizeOptions(composite[val]);

      if (options) {
        acc.add(commands.addKeyBinding(options));
      }

      return acc;
    }, new DisposableSet());
  }

  /**
   * Normalize potential keyboard shortcut options.
   */
  function normalizeOptions(
    value: ReadonlyJSONValue | Partial<CommandRegistry.IKeyBindingOptions>
  ): CommandRegistry.IKeyBindingOptions | undefined {
    if (!value || typeof value !== 'object') {
      return undefined;
    }

    const { isArray } = Array;
    const valid =
      'command' in value &&
      'keys' in value &&
      'selector' in value &&
      isArray((value as Partial<CommandRegistry.IKeyBindingOptions>).keys);

    return valid ? (value as CommandRegistry.IKeyBindingOptions) : undefined;
  }

  /**
   * Return a transformer that return a settings object annotated defaults.
   */
  export function transform(
    commands: CommandRegistry,
    registry: ISettingRegistry
  ): ISettingRegistry.SettingTransform {
    // Transform the settings object to return different annotated defaults
    // calculated from all the keyboard shortcuts in the registry instead of
    // using the default values from this plugin's schema.
    class ShortcutSettings extends Settings {
      annotatedDefaults(): string {
        return 'These are the annotated defaults.';
      }
    }

    return settings => {
      const plugin = registry.plugins.filter(p => p.id === settings.plugin)[0];

      if (!plugin) {
        return settings;
      }

      return new ShortcutSettings({ plugin, registry });
    };
  }
}
