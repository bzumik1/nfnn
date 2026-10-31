import { receiptCaptions } from './receipt-captions';

describe('Given the captions printed beside the verification QR code', () => {
  it('when they are read, then they say that the code shows what the foundation signed, in Czech and in English', () => {
    const captions = receiptCaptions();

    expect(captions.verificationText).toEqual({
      cs: 'Načtěte kód telefonem nebo na něj klikněte: ukáže, co fond na potvrzení podepsal.',
      en: 'Scan the code or click it to see what the foundation signed on this confirmation.',
    });
  });

  it('when they are read, then they claim nothing about whether the confirmation is still valid, which the code cannot know offline', () => {
    const { verificationHeading, verificationText } = receiptCaptions();
    const printed = [
      verificationHeading.cs,
      verificationHeading.en,
      verificationText.cs,
      verificationText.en,
    ].join(' ');

    expect(printed).not.toMatch(/platí|platn|valid/i);
  });
});
