import fs         from 'fs';
import path       from 'path';
import postcss    from 'postcss';

import CSSEntry   from './CSSEntry.js';

/**
 * Provides a TyphonJS plugin allowing essential control of PostCSS via events.
 */
export default class PostCSS
{
   /**
    * Instantiates PostCSS
    */
   constructor()
   {
      this._cssEntries = new Map();
   }

   /**
    * Wires up PostCSS on the plugin eventbus.
    *
    * @param {PluginEvent} ev - The plugin event.
    */
   onPluginLoad(ev)
   {
      this._eventbus = ev.eventbus;

      this._eventbus.on('typhonjs:theme:postcss:append', this.append, this);
      this._eventbus.on('typhonjs:theme:postcss:append:process', this.appendProcess, this);
      this._eventbus.on('typhonjs:theme:postcss:create', this.create, this);
      this._eventbus.on('typhonjs:theme:postcss:finalize', this.finalize, this);
      this._eventbus.on('typhonjs:theme:postcss:finalize:all', this.finalizeAll, this);
      this._eventbus.on('typhonjs:theme:postcss:prepend', this.prepend, this);
      this._eventbus.on('typhonjs:theme:postcss:prepend:process', this.prependProcess, this);
      this._eventbus.on('typhonjs:theme:postcss:process', this.process, this);
   }

   /**
    * Appends to a CSS entry by name the given CSS data or attempts to load data from the given file path.
    *
    * @param {string}   name - CSS data is appended to the given CSS entry name.
    *
    * @param {string}   [css] - Raw CSS data to append.
    *
    * @param {string}   [dirName] - The absolute directory to resolve.
    *
    * @param {string}   [filePath] - The relative directory to resolve.
    *
    * @param {string}   [from] - A name to include in source maps generation; loading a file automatically uses
    *                            file path.
    *
    * @param {boolean}  [silent=false] - When true any logging is skipped.
    */
   append({ name, css, dirName, filePath, from = 'unknown', silent = false } = {})
   {
      if (typeof silent !== 'boolean') { throw new TypeError(`'silent' is not a 'boolean'.`); }

      if (!this._cssEntries.has(name))
      {
         if (!silent)
         {
            this._eventbus.trigger('log:warn',
             `typhonjs-postcss append: A CSS entry does not exist for '${name}'.`);
         }

         return;
      }

      const entry = this._cssEntries.get(name);

      if (typeof css === 'string')
      {
         entry.root.append(postcss.parse(css, { from }));
      }
      else if (typeof filePath === 'string')
      {
         const file = typeof dirName === 'string' ? path.resolve(dirName, filePath) : path.resolve(filePath);

         const cssFile = fs.readFileSync(path.resolve(file), 'utf8');

         entry.root.append(postcss.parse(`\n${cssFile}`, { from: file }));
      }
      else
      {
         if (!silent)
         {
            this._eventbus.trigger('log:error', `typhonjs-postcss append: no valid css or file path provided.`);
         }

         throw new Error('typhonjs-postcss append: no valid css or file path provided.');
      }
   }

   /**
    * Appends to a CSS entry by name the given CSS data or attempts to load data from the given file path after processing
    * by PostCSS with the given processors.
    *
    * @param {string}   name - CSS data is appended to the given CSS entry.
    *
    * @param {string}   [css] - Raw CSS data to append.
    *
    * @param {string}   [dirName] - The absolute directory to resolve.
    *
    * @param {string}   [filePath] - The relative directory to resolve.
    *
    * @param {string}   [from] - A name to include in source maps generation; loading a file automatically uses
    *                            file path.
    *
    * @param {Array<object>} [processors] - An array of PostCSS processing plugins to apply.
    *
    * @param {boolean}  [silent=false] - When true any logging is skipped.
    */
   async appendProcess({ name, css, dirName, filePath, from = void 0, processors = [], silent = false } = {})
   {
      const result = await s_PROCESS_IMPL({ css, dirName, filePath, from, processors, silent });

      this.append({ name, css: result.css, from: result.from, silent });
   }

   /**
    * Creates a CSS entry by name which can be further modified before finalization
    *
    * @param {string}         name - CSS data is appended to the given CSS entry.
    *
    * @param {string}         [to] - Source map destination.
    *
    * @param {boolean|object} [map=true] - Enables source map tracking; see full PostCSS source map options.
    *
    * @param {Array<object>}  [processors] - An array of PostCSS processing plugins to apply upon finalization.
    *
    * @param {boolean}        [silent=false] - When true any logging is skipped.
    *
    * @see https://github.com/postcss/postcss/blob/master/docs/source-maps.md
    */
   create({ name, to = 'unknown', map = true, processors = [], silent = false } = {})
   {
      if (typeof silent !== 'boolean') { throw new TypeError(`'silent' is not a 'boolean'.`); }

      if (this._cssEntries.has(name))
      {
         if (!silent)
         {
            this._eventbus.trigger('log:warn',
             `typhonjs-postcss create: A CSS entry already exists for '${name}'.`);
         }

         return;
      }

      this._cssEntries.set(name, new CSSEntry(to, map, processors));
   }

   /**
    * Finalizes a CSS entry by name and removes it from tracking.
    *
    * @param {string}   name - Name of CSS entry to finalize.
    *
    * @param {boolean}  [silent=false] - When true any logging is skipped.
    *
    * @returns {string} Processed CSS.
    */
   async finalize({ name, silent = false } = {})
   {
      if (typeof silent !== 'boolean') { throw new TypeError(`'silent' is not a 'boolean'.`); }

      if (!this._cssEntries.has(name))
      {
         if (!silent)
         {
            this._eventbus.trigger('log:warn',
             `typhonjs-postcss append: A CSS entry does not exist for '${name}'.`);
         }

         return;
      }

      const entry = this._cssEntries.get(name);

      let result = entry.root.toResult({ to: entry.to, map: entry.map });

      if (entry.processors.length)
      {
         result = await postcss(entry.processors).process(result, { to: entry.to });
      }

      this._cssEntries.delete(name);

      return result;
   }

   /**
    * Finalizes all CSS entries and removes them from tracking.
    *
    * @param {boolean}  [silent=false] - When true any logging is skipped.
    *
    * @returns {Array<object>} An array of entries; each one being an object with `name` and `fileData`.
    */
   async finalizeAll({ silent = false } = {})
   {
      const results = [];

      for (const name of this._cssEntries.keys())
      {
         const data = await this.finalize({ name, silent });

         results.push({ name, data });
      }

      return results;
   }

   /**
    * Prepends to a CSS entry by name the given CSS data or attempts to load data from the given file path.
    *
    * @param {string}   name - CSS data is appended to the given CSS entry.
    *
    * @param {string}   [css] - Raw CSS data to append.
    *
    * @param {string}   [dirName] - The absolute directory to resolve.
    *
    * @param {string}   [filePath] - The relative directory to resolve.
    *
    * @param {string}   [from] - A name to include in source maps generation; loading a file automatically uses
    *                            file path.
    *
    * @param {boolean}  [silent=false] - When true any logging is skipped.
    */
   prepend({ name, css, dirName, filePath, from = 'unknown', silent = false } = {})
   {
      if (typeof silent !== 'boolean') { throw new TypeError(`'silent' is not a 'boolean'.`); }

      if (!this._cssEntries.has(name))
      {
         if (!silent)
         {
            this._eventbus.trigger('log:warn',
             `typhonjs-postcss prepend: A CSS entry does not exist for '${name}'.`);
         }

         return;
      }

      const entry = this._cssEntries.get(name);

      if (typeof css === 'string')
      {
         entry.root.prepend(postcss.parse(css, { from }));
      }
      else if (typeof filePath === 'string')
      {
         const file = typeof dirName === 'string' ? path.resolve(dirName, filePath) : path.resolve(filePath);

         const cssFile = fs.readFileSync(path.resolve(file), 'utf8');

         entry.root.prepend(postcss.parse(`${cssFile}\n`, { from: file }));
      }
      else
      {
         if (!silent)
         {
            this._eventbus.trigger('log:error', `typhonjs-postcss prepend: no valid css or file path provided.`);
         }

         throw new Error('typhonjs-postcss prepend: no valid css or file path provided.');
      }
   }

   /**
    * Prepends to a CSS entry by name the given CSS data or attempts to load data from the given file path after
    * processing by PostCSS with the given processors.
    *
    * @param {string}   name - CSS data is appended to the given CSS entry.
    *
    * @param {string}   [css] - Raw CSS data to append.
    *
    * @param {string}   [dirName] - The absolute directory to resolve.
    *
    * @param {string}   [filePath] - The relative directory to resolve.
    *
    * @param {string}   [from] - A name to include in source maps generation; loading a file automatically uses
    *                            file path.
    *
    * @param {Array<object>} [processors] - An array of PostCSS processing plugins to apply.
    *
    * @param {boolean}  [silent=false] - When true any logging is skipped.
    */
   async prependProcess({ name, css, dirName, filePath, from = void 0, processors = [], silent = false } = {})
   {
      const result = await s_PROCESS_IMPL({ css, dirName, filePath, from, processors, silent });

      this.prepend({ name, css: result.css, from: result.from, silent });
   }

   /**
    * Immediately processes and returns CSS data from the given CSS data or attempts to load data from the given file
    * path.
    *
    * @param {string}   [css] - Raw CSS data to append.
    *
    * @param {string}   [dirName] - The absolute directory to resolve.
    *
    * @param {string}   [filePath] - The relative directory to resolve.
    *
    * @param {string}   [from] - A name to include in source maps generation; loading a file automatically uses
    *                            file path.
    *
    * @param {Array<object>} [processors] - An array of PostCSS processing plugins to apply.
    *
    * @param {boolean}  [silent=false] - When true any logging is skipped.
    *
    * @returns {string} Processed CSS.
    */
   async process({ css, dirName, filePath, from = void 0, processors = [], silent = false } = {})
   {
      return s_PROCESS_IMPL({ css, dirName, filePath, from, processors, silent }).css;
   }
}

/**
 * Provides the implementation to process and returns CSS data from the given CSS data or attempts to load data from
 * the given file path.
 *
 * @param {string}   [css] - Raw CSS data to append.
 *
 * @param {string}   [dirName] - The absolute directory to resolve.
 *
 * @param {string}   [filePath] - The relative directory to resolve.
 *
 * @param {string}   [from] - A name to include in source maps generation; loading a file automatically uses
 *                            file path.
 *
 * @param {Array<object>} [processors] - An array of PostCSS processing plugins to apply.
 *
 * @param {boolean}  [silent=false] - When true any logging is skipped.
 *
 * @returns {string} Processed CSS.
 */
const s_PROCESS_IMPL = async ({ css, dirName, filePath, from = void 0, processors = [], silent = false } = {}) =>
{
   let cssData, result;

   if (typeof css === 'string')
   {
      cssData = css;
   }
   else if (typeof filePath === 'string')
   {
      const file = typeof dirName === 'string' ? path.resolve(dirName, filePath) : path.resolve(filePath);

      cssData = fs.readFileSync(path.resolve(file), 'utf8');

      if (typeof from === 'undefined') { from = file; }
   }
   else
   {
      if (!silent)
      {
         this._eventbus.trigger('log:error', `typhonjs-postcss process: no valid css or file path provided.`);
      }

      throw new Error('typhonjs-postcss process: no valid css or file path provided.');
   }

   if (processors.length)
   {
      if (typeof from === 'undefined') { from = 'unknown'; }

      result = await postcss(processors, { from }).process(cssData);
   }

   return { css: typeof result !== 'undefined' ? result : cssData, from };
};