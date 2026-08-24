import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { OCR_DIAGNOSTIC_EXPECTED, ocrDiagnosticImage, ocrDiagnosticMatches } from './ocr-diagnostic-image.js';

describe('OCR diagnostic image',()=>{
  it('contains a complete, decodable PNG pixel stream',()=>{
    const image=ocrDiagnosticImage();
    expect(image.subarray(0,8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    let offset=8,width=0,height=0,bitDepth=0,colorType=0,interlace=0,sawEnd=false;
    const compressed:Buffer[]=[];
    while(offset<image.length){
      const length=image.readUInt32BE(offset),type=image.toString('ascii',offset+4,offset+8),dataStart=offset+8,dataEnd=dataStart+length;
      expect(dataEnd+4).toBeLessThanOrEqual(image.length);
      if(type==='IHDR'){
        width=image.readUInt32BE(dataStart);height=image.readUInt32BE(dataStart+4);bitDepth=image[dataStart+8]??0;colorType=image[dataStart+9]??0;interlace=image[dataStart+12]??0;
      }else if(type==='IDAT')compressed.push(image.subarray(dataStart,dataEnd));
      else if(type==='IEND')sawEnd=true;
      offset=dataEnd+4;
    }
    expect({width,height,bitDepth,colorType,interlace,sawEnd,offset}).toEqual({width:832,height:738,bitDepth:8,colorType:2,interlace:0,sawEnd:true,offset:image.length});
    expect(inflateSync(Buffer.concat(compressed))).toHaveLength((width*3+1)*height);
    expect(OCR_DIAGNOSTIC_EXPECTED).toBe('把高精力人群磨成粉做成兴奋剂');
  });
  it('matches the Chinese expected text without accepting unrelated OCR output',()=>{
    expect(ocrDiagnosticMatches('把高精力人群，磨成粉做成兴奋剂。')).toBe(true);
    expect(ocrDiagnosticMatches('把低精力人群磨成粉做安眠药')).toBe(false);
    expect(ocrDiagnosticMatches('OCR TEST 12345')).toBe(false);
  });
});
