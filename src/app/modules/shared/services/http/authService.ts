import { Injectable } from '@angular/core';
import { LoginResponse } from '../../models/login/loginResponse.dto';
import { Observable, of } from 'rxjs';
import { LoginDTO } from '../../models/login/login.dto';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  login(loginParams: LoginDTO): Observable<LoginResponse> {
    console.log('loginParams: ', loginParams);
    const res = new LoginResponse();
    res.access_token = '213';
    res.accountId = '';
    res.companyId = '';
    res.createdAt = new Date();
    res.expires_in = '';
    res.token_type = '';
    return of(res);
  }
}
