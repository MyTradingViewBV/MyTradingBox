export class SymbolModel {
  Id = 0;
  SymbolName = '';
  Active = false;
  RunStatus = '';
  // New: optional icon/url returned by API
  Icon?: string = '';
}