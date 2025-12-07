export class LoginDTO {
  username = '';
  password = '';
  // Optional honeypot field; bots often populate this
  website?: string;
}
