export type OneBot11MessageSegment =
  | { type: "text"; data: { text: string } }
  | { type: "image"; data: { file?: string; url?: string; type?: string } }
  | { type: "at"; data: { qq: string } }
  | { type: "reply"; data: { id: string } };

export type OneBot11Message = OneBot11MessageSegment[];

export type OneBot11EventBase = {
  time: number;
  self_id: number;
  post_type: string;
};

export type OneBot11MessageEvent = OneBot11EventBase & {
  post_type: "message";
  message_type: "private" | "group" | string;
  sub_type?: string;
  message_id?: number;
  user_id?: number;
  group_id?: number;
  message?: OneBot11Message | string;
  raw_message?: string;
  sender?: {
    user_id: number;
    nickname?: string;
    card?: string;
  };
};

export type OneBot11MetaEvent = OneBot11EventBase & {
  post_type: "meta_event";
  meta_event_type?: string;
  sub_type?: string;
};

export type OneBot11AnyEvent = OneBot11MessageEvent | OneBot11MetaEvent | (OneBot11EventBase & Record<string, any>);

export type OneBot11ActionRequest = {
  action: string;
  params?: any;
  echo?: string;
};

export type OneBot11ActionResponse = {
  status?: "ok" | "failed";
  retcode?: number;
  msg?: string;
  wording?: string;
  data?: any;
  echo?: string;
};
