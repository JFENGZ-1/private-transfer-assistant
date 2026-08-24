import { readFileSync } from 'node:fs';

const diagnosticImage=readFileSync(new URL('../assets/ocr-diagnostic.png',import.meta.url));

export const OCR_DIAGNOSTIC_EXPECTED='把高精力人群磨成粉做成兴奋剂';
export const ocrDiagnosticImage=()=>Buffer.from(diagnosticImage);
export function ocrDiagnosticMatches(recognizedText:string){
  const normalize=(value:string)=>value.normalize('NFKC').toUpperCase().replace(/[^\p{L}\p{N}]/gu,'');
  const expected=normalize(OCR_DIAGNOSTIC_EXPECTED);
  return expected.length>0&&normalize(recognizedText).includes(expected);
}
