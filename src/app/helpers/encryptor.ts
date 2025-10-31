import { Rabbit, SHA3, enc } from 'crypto-js';
import { environment } from '../../environments/environment';
export default class Encryptor {
  static key = SHA3('SuperSecretKey', { outputLength: 224 }).toString();
  static iv = SHA3('SuperSecretIV', { outputLength: 224 });
  static encFunction(message: string): string {
    if (environment.production) {
      const encoded = Rabbit.encrypt(message, Encryptor.key, {
        iv: Encryptor.iv,
      });
      return encoded.toString();
    }
    return message;
  }
  static decFunction(encMessage: string): string {
    if (environment.production) {
      const encoded = Rabbit.decrypt(encMessage, Encryptor.key, {
        iv: Encryptor.iv,
      }).toString(enc.Utf8);
      return encoded;
    }
    return encMessage;
  }
}
