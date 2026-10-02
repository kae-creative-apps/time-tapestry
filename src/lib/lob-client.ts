import {
  Configuration,
  PostcardsApi,
  Postcard,
  PostcardEditable,
  AddressEditable
} from '@lob/lob-typescript-sdk';

const apiKey = process.env.LOB_API_KEY;

const config = apiKey ? new Configuration({ username: apiKey }) : null;

export const lobPostcards = config ? new PostcardsApi(config) : null;

export async function createPostcard(
  toAddress: {
    name: string;
    address_line1: string;
    address_city: string;
    address_state: string;
    address_zip: string;
  },
  frontHtml: string,
  backHtml: string,
  sendDate?: string
): Promise<Postcard | null> {
  if (!lobPostcards) {
    console.log('[MOCK LOB] Postcard scheduled', {
      toAddress,
      frontHtml,
      backHtml,
      sendDate
    });
    return {
      id: `mock-psc-${Date.now()}`,
      url: 'https://lob.com/mock-postcard'
    } as Postcard;
  }

  const address = new AddressEditable();
  address.name = toAddress.name;
  address.address_line1 = toAddress.address_line1;
  address.address_city = toAddress.address_city;
  address.address_state = toAddress.address_state;
  address.address_zip = toAddress.address_zip;

  const postcard = new PostcardEditable();
  postcard.to = address;
  postcard.front = frontHtml;
  postcard.back = backHtml;
  if (sendDate) postcard.send_date = sendDate;

  const result = await lobPostcards.create(postcard);
  return result;
}
