export interface ResourceData {
  [key: string]: unknown;
  contents: [
    {
      uri: string;
      mimeType: string;
      text: string;
    },
  ];
}

export function toResource(uri: string, data: unknown): ResourceData {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}
