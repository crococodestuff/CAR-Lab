// Explicit source allowlist. Vite embeds the actual files, never a copied algorithm.
import ingest from '../../backend/car_core/ingest.py?raw';
import quality from '../../backend/car_core/quality.py?raw';
import aggregate from '../../backend/car_core/aggregate.py?raw';
import cox from '../../backend/car_core/cox.py?raw';
import config from '../../backend/car_core/config.py?raw';
import mapopt from '../../backend/car_core/mapopt.py?raw';
import analysis from '../../backend/car_core/analysis.py?raw';
import stratify from '../../backend/car_core/stratify.py?raw';
import raw_summary from '../../backend/car_core/raw_summary.py?raw';
export const sources={ingest,quality,aggregate,cox,config,mapopt,analysis,stratify,raw_summary};
