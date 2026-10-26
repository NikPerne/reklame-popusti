import { isValidEan, toEan13 } from './barcode';

describe('barcodes', () => {
  it.each([
    ['3838975531314', true], // Barcaffe (EAN-13)
    ['5411188141488', true], // Alpro
    ['40111216', true], // EAN-8
    ['036000291452', true], // UPC-A
    ['3838975531315', false], // wrong check digit
    ['12345', false],
    ['abcdefghijklm', false],
  ])('%s is valid: %s', (code, valid) => {
    expect(isValidEan(code)).toBe(valid);
  });

  it('turns UPC-A into the EAN-13 stores use', () => {
    expect(toEan13('036000291452')).toBe('0036000291452');
    expect(toEan13('3838975531314')).toBe('3838975531314');
  });
});
