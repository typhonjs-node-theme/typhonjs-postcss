import postcss from 'postcss';

/**
 * Provides a CSS entry for processing by PostCSS. The PostCSS processors which are specified are required as necessary.
 */
export default class CSSEntry
{
   /**
    * Instantiate CSSEntry loading any specified processors.
    *
    * @param {string}         to - `to` data for source maps.
    * @param {boolean}        map - Indicates whether to generate source maps.
    * @param {Array<object>}  processors - An array of objects defining the PostCSS processors to load.
    */
   constructor(to, map, processors)
   {
      this.to = to;
      this.map = map;
      this.processors = processors.map((entry) =>
      {
         if (typeof entry === 'object')
         {
            if (typeof entry.instance === 'object' || typeof entry.instance === 'function')
            {
               return entry.instance;
            }
            else if (typeof entry.name === 'string')
            {
               return entry.options ? require(entry.name)(entry.options) : require(entry.name);
            }
            else
            {
               throw new Error(
                `typhonjs-postcss - GroupEntry: an entry in processors does not include 'name' or 'instance' entries.`);
            }
         }
         else
         {
            throw new Error(`typhonjs-postcss - GroupEntry: an entry in processors is not an 'object'.`);
         }
      });

      this.root = postcss.root();
   }
}
