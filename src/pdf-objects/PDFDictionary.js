/* @flow */
import _ from 'lodash';
import { addStringToBuffer, charCodes, charCode } from '../utils';

import PDFObject from './PDFObject';
import { PDFIndirectReference, PDFIndirectObject, PDFName } from '.';

class PDFDictionary extends PDFObject {
  map: Map<PDFName, PDFObject> = new Map();
  validKeys: ?Array<string>;

  constructor(object: ?{ [string]: PDFObject }, validKeys: ?Array<string>) {
    super();
    this.validKeys = validKeys;
    if (object) {
      _.forEach(object, (val, key) => {
        this.set(key, val, false);
      });
    }
  }

  static fromObject = object => new PDFDictionary(object);

  set = (key: string | PDFName, val: PDFObject, validate: ?boolean = true) => {
    if (typeof key !== 'string' && !(key instanceof PDFName)) {
      throw new Error(
        'PDFDictionary.set() requires keys to be strings or PDFNames',
      );
    }
    if (!(val instanceof PDFObject)) {
      throw new Error('PDFDictionary.set() requires values to be PDFObjects');
    }

    const keyName = typeof key === 'string' ? PDFName.forString(key) : key;
    if (validate && this.validKeys && !this.validKeys.includes(keyName.key)) {
      throw new Error(`Invalid key: "${keyName.key}"`);
    }
    this.map.set(keyName, val);

    return this;
  };

  get = (key: string | PDFName) => {
    if (typeof key !== 'string' && !(key instanceof PDFName)) {
      throw new Error(
        'PDFDictionary.set() requires keys to be strings or PDFNames',
      );
    }

    if (typeof key === 'string') return this.map.get(PDFName.forString(key));
    return this.map.get(key);
  };

  dereference = (
    indirectObjects: Map<PDFIndirectReference, PDFIndirectObject>,
  ) => {
    this.map.forEach((val, key) => {
      if (val instanceof PDFIndirectReference) {
        const obj = indirectObjects.get(val);

        if (!obj) {
          const msg = `Failed to dereference: (${key.toString()}, ${val.toString()})`;

          // For some reason, '/Obj' values always seem to fail dereferencing.
          // This still seems to be a bug, however.
          if (key.toString() === '/Obj') console.warn(msg);
          else throw new Error(msg);
        } else {
          if (key.toString() === '/Obj') {
            console.log(
              `Successfully dereferenced (${key.toString()}, ${val.toString()})`,
            );
          }
          this.set(key, obj);
        }
      }
    });
  };

  toString = () => {
    let str = '<<\n';
    this.map.forEach((val, key) => {
      str += `${key.toString()} `;
      if (val instanceof PDFIndirectObject) str += `${val.toReference()}\n`;
      else if (val instanceof PDFObject) str += `${val.toString()}\n`;
      else throw new Error(`Not a PDFObject: ${val.constructor.name}`);
    });
    str += '>>';

    return str;
  };

  bytesSize = () =>
    3 + // "<<\n"
    _(Array.from(this.map.entries()))
      .map(([key, val]) => {
        const keySize = `${key.toString()} `.length;
        if (val instanceof PDFIndirectObject) {
          return keySize + val.toReference().length + 1;
        } else if (val instanceof PDFObject) {
          return keySize + val.bytesSize() + 1;
        }
        throw new Error(`Not a PDFObject: ${val.constructor.name}`);
      })
      .sum() +
    2; // ">>"

  addBytes = (buffer: Uint8Array): Uint8Array => {
    let remaining = addStringToBuffer('<<\n', buffer);
    this.map.forEach((val, key) => {
      remaining = addStringToBuffer(`${key.toString()} `, remaining);
      if (val instanceof PDFIndirectObject) {
        remaining = addStringToBuffer(val.toReference(), remaining);
      } else if (val instanceof PDFObject) {
        remaining = val.addBytes(remaining);
      } else {
        throw new Error(`Not a PDFObject: ${val.constructor.name}`);
      }
      remaining = addStringToBuffer('\n', remaining);
    });
    remaining = addStringToBuffer('>>', remaining);
    return remaining;
  };
}

export default PDFDictionary;
