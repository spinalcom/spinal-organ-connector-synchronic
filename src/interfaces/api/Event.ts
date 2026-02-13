export type EventControlUnit = {
  id: number;
  name: string;
};

export type EventUser = {
  lastname: string;
  firstname: string;
};

export type EventGroup = {
  id: number;
  name: string;
};

export type EventRecord = {
  id: number;
  reception_date: string;
  source_date: string;
  reference: number;
  pu_reference: string;
  control_unit: EventControlUnit;
  user: EventUser | null;
  group: EventGroup | null;
  stringified_evt: string;
  unit: string;
  identifier: string | null;
  sia_code: string;
  sia_code_complement: string;
  color: string | null;
  color_rgb: number;
  bus: number;
  address: number;
  refusal_cause: number | null;
  module_id: number | null;
};
