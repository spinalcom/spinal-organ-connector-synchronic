export type ControlUnit = {
  id: number;
  name: string;
  reference: number;
  folder_number: number;
  folder_path: string;
  ip: string;
  protocol: number;
  fast_update_compatibility: number;
  creation_date: string;
  update_date: string | null;
  created_by: string;
  updated_by: string;
};

export type AccessRecord = {
  id: number;
  name: string;
  type: number;
  disabled: number;
  subarea_id: number;
  controlUnit: ControlUnit;
};
