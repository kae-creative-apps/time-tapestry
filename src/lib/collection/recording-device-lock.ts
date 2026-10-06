/** A live recorder owns its collection's device journal until it stops. */
export async function claimRecordingDeviceLock(
  collectionId: string,
): Promise<() => void> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return () => {};
  return new Promise((resolve, reject) => {
    void locks
      .request(
        `time-tapestry:recording:${collectionId}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            reject(
              new Error(
                "This interview is open in another recording tab. Finish saving and close that tab, then reload this page.",
              ),
            );
            return;
          }
          await new Promise<void>((release) => resolve(release));
        },
      )
      .catch(reject);
  });
}
