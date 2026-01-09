export type AuthDto = {
  user: string; // -> needed? i guess for metrics?
  repository: string; // -> points to the correct bucket
  writeOnce: boolean; // -> TODO: do not permit delete & prevent overwriting
};
