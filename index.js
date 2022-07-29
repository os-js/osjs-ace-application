/*!
 * OS.js - JavaScript Cloud/Web Desktop Platform
 *
 * Copyright (c) Anders Evenrud <andersevenrud@gmail.com>
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this
 *    list of conditions and the following disclaimer
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR ha PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
 * ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * @author  Anders Evenrud <andersevenrud@gmail.com>
 * @licence Simplified BSD License
 */

import * as ace from 'brace';
import 'brace/theme/monokai';
import 'brace/mode/javascript';
import 'brace/mode/python';
import 'brace/mode/css';
import 'brace/mode/html';
import 'brace/ext/modelist';
import 'brace/ext/themelist';
import {h, app} from 'hyperapp';
import {Box, BoxContainer, Menubar, MenubarItem, Statusbar} from '@osjs/gui';
import osjs from 'osjs';
import {name as applicationName} from './metadata.json';

const createFileMenu = (current, actions, _) => ([
  {label: _('LBL_NEW'), onclick: () => actions.menuNew()},
  {label: _('LBL_OPEN'), onclick: () => actions.menuOpen()},
  {label: _('LBL_SAVE'), disabled: !current, onclick: () => actions.menuSave()},
  {label: _('LBL_SAVEAS'), onclick: () => actions.menuSaveAs()},
  {label: _('LBL_QUIT'), onclick: () => actions.menuQuit()}
]);

const createThemeMenu = (themes, current, actions) => themes.map(theme => ({
  label: theme.caption,
  onclick: () => actions.setTheme(theme.name)
}));

const createModeMenu = (modes, current, actions) => modes.map(mode => ({
  label: mode.caption,
  onclick: () => actions.setMode(mode.name)
}));

// OS.js application
const createApplication = (core, proc, win, $content) => {
  let editor;
  const vfs = core.make('osjs/vfs');
  const _ = core.make('osjs/locale').translate;
  const modelist = ace.acequire('ace/ext/modelist');
  const themelist = ace.acequire('ace/ext/themelist');

  const setText = contents => editor.setValue(contents);
  const getText = () => editor.getValue();

  // BasicApplication
  const basic = core.make('osjs/basic-application', proc, win, {
    defaultFilename: 'New File.txt'
  });

  // Hyperapp
  const ha = app({
    theme: 'ace/theme/monokai',
    mode: 'none',
    row: 0,
    column: 0,
    lines: 0
  }, {
    setStatus: ({row, column, lines, mode}) => state => ({row, column, lines, mode}),
    setTheme: theme => state => {
      editor.setTheme(theme);

      return {theme};
    },

    save: () => state => {
      if (proc.args.file) {
        vfs.writefile(proc.args.file, getText());
      }
    },

    load: item => (state, actions) => {
      const mode = modelist.getModeForPath(item.path);
      editor.getSession().setMode(mode.mode);

      vfs.readfile(item)
        .then(setText)
        .catch(error => console.error(error)); // FIXME: Dialog
    },

    fileMenu: ev => (state, actions) => {
      core.make('osjs/contextmenu').show({
        position: ev.target,
        menu: createFileMenu(proc.args.file, actions, _)
      });
    },

    themeMenu: ev => (state, actions) => {
      core.make('osjs/contextmenu').show({
        position: ev.target,
        menu: createThemeMenu(themelist.themes, null, actions)
      });
    },

    modeMenu: ev => (state, actions) => {
      core.make('osjs/contextmenu').show({
        position: ev.target,
        menu: createModeMenu(modelist.modes, null, actions)
      });
    },

    menuNew: () => state => basic.createNew(),
    menuOpen: () => state => basic.createOpenDialog(),
    menuSave: () => (state, actions) => actions.save(),
    menuSaveAs: () => state => basic.createSaveDialog(),
    menuQuit: () => state => proc.destroy()
  }, (state, actions) => {
    return h(Box, {}, [
      h(Menubar, {}, [
        h(MenubarItem, {
          onclick: ev => actions.fileMenu(ev)
        }, _('LBL_FILE'))
        /*
        h(MenubarItem, {
          onclick: ev => actions.themeMenu(ev)
        }, 'Theme'),
        h(MenubarItem, {
          onclick: ev => actions.modeMenu(ev)
        }, 'Mode')
        */
      ]),
      h(BoxContainer, {
        key: 'aceeditor',
        grow: 1,
        oncreate: el => {
          if (!editor) {
            editor = ace.edit(el);
            editor.setTheme(state.theme);
            editor.getSession().selection.on('changeCursor', () => {
              const {row, column} = editor.selection.getCursor();
              const lines = editor.session.getLength();
              const mode = editor.session.getMode().$id;
              ha.setStatus({row, column, lines, mode});
            });

            basic.init();
          }
        }
      }),
      h(Statusbar, {}, `Row: ${state.row} Column: ${state.column} Lines: ${state.lines} Mode: ${state.mode}`)
    ]);
  }, $content);

  proc.on('destroy', () => basic.destroy());
  win.on('resized', () => editor.resize());
  win.on('blur', () => editor.blur());
  win.on('focus', () => editor.focus());
  win.on('drop', (ev, data) => {
    if (data.isFile && data.mime) {
      const found = proc.metadata.mimes.find(m => (new RegExp(m)).test(data.mime));
      if (found) {
        basic.open(data);
      }
    }
  });
  basic.on('new-file', () => setText(''));
  basic.on('save-file', ha.save);
  basic.on('open-file', ha.load);
};

// OS.js window
const createMainWindow = (core, proc) => {
  proc.createWindow({
    id: 'AceEditorWindow',
    icon: proc.resource(proc.metadata.icon),
    dimension: {width: 400, height: 400}
  })
    .on('destroy', () => proc.destroy())
    .on('render', (win) => win.focus())
    .render(($content, win) => createApplication(core, proc, win, $content));
};

const createProcess = (core, args, options, metadata) => {
  const proc = core.make('osjs/application', {args, options, metadata});
  createMainWindow(core, proc);
  return proc;
};

osjs.register(applicationName, createProcess);
