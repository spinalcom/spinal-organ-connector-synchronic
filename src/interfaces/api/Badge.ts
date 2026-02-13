export type IdentifierFormat = {
  id: number;
  name: string;
  pattern: string;
  type: number;
};

export type IdentifierType = {
  id: number;
  name: string;
  is_subtype: boolean;
};

export type IdentifierItem = {
  identifier: string;
  type: IdentifierType;
  format: IdentifierFormat;
};

export type BadgeIdentifier = {
  id: number;
  identifier: string;
  is_attributed: boolean;
  blocked: boolean;
  format: IdentifierFormat;
  formatId: number;
  identifierType: string;
  computedIdentifier: string;
  type: IdentifierType;
  identifiers: IdentifierItem[];
  option: number;
  quota_reached: boolean;
  creation_date: string;
  update_date: string | null;
};

export type BadgeUser = {
  id: number;
  firstname: string;
  lastname: string;
  blocked: boolean;
  hasPhoto: boolean;
};

export type BadgeRecord = {
  id: number;
  uid: string;
  mifare_profile: string;
  technology: string;
  operator: string;
  encoding_date: string | null;
  encoding_size: number;
  encoding_count: number;
  encoding_info: string;
  creation_date: string;
  update_date: string | null;
  update_info: string | null;
  quota_reached: boolean;
  status: string;
  virtual: number;
  virtual_design: string;
  label: string;
  identifier: BadgeIdentifier;
  user: BadgeUser;
  option: number;
};
