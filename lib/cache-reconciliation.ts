export function hasLibraryConflict(cache:{revision:number;knownRevision?:boolean},remoteRevision:number){
  // A guessed revision after a failed initial fetch is never a safe overwrite base.
  return !cache.knownRevision || cache.revision!==remoteRevision;
}
