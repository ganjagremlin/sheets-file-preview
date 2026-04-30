/**
 * FileService — Drive lookup, recursive search, and caching.
 *
 * Caching strategy:
 *  - Vault folder ID is cached forever in PropertiesService (resolved once).
 *  - File content is cached in CacheService for CONFIG.cacheTtlSeconds.
 *  - File-name → file-ID mapping is also cached so we skip the recursive
 *    walk on cache hits.
 *  - We track all cache keys we've written in PropertiesService so we can
 *    invalidate everything on demand (CacheService has no "clear all").
 */
const FileService = (function () {
  const CONTENT_PREFIX = 'content::';
  const FILEID_PREFIX = 'fileid::';
  const KEY_INDEX_PROP = 'cacheKeyIndex';

  /**
   * Public: returns { content, error } for a given file name.
   */
  function getFileContent(fileName) {
    const cache = CacheService.getUserCache();
    const cacheKey = CONTENT_PREFIX + fileName;

    const cached = cache.get(cacheKey);
    if (cached !== null) {
      return { content: cached, error: null };
    }

    try {
      const file = findFile(fileName);
      if (!file) {
        return {
          content: null,
          error: `File not found in vault: ${fileName}`
        };
      }

      const content = file.getBlob().getDataAsString();
      putCache(cacheKey, content);
      return { content: content, error: null };
    } catch (err) {
      return { content: null, error: `Error reading file: ${err.message}` };
    }
  }

  /**
   * Public: clears all tracked cache keys and the folder ID property.
   */
  function invalidateAll() {
    const cache = CacheService.getUserCache();
    const props = PropertiesService.getUserProperties();
    const indexJson = props.getProperty(KEY_INDEX_PROP);
    if (indexJson) {
      try {
        const keys = JSON.parse(indexJson);
        if (Array.isArray(keys) && keys.length) {
          cache.removeAll(keys);
        }
      } catch (e) {
        // Index corrupted — nothing we can do, just clear it.
      }
    }
    props.deleteProperty(KEY_INDEX_PROP);
  }

  /**
   * Public: invalidates the cache entries for a single file (content + ID).
   */
  function invalidateFile(fileName) {
    const cache = CacheService.getUserCache();
    cache.removeAll([CONTENT_PREFIX + fileName, FILEID_PREFIX + fileName]);
  }

  // ---- internals ----

  /**
   * Finds a file by name within the configured vault folder, recursively.
   * Uses cached file ID when available.
   */
  function findFile(fileName) {
    // Fast path: cached file ID
    const cache = CacheService.getUserCache();
    const idKey = FILEID_PREFIX + fileName;
    const cachedId = cache.get(idKey);
    if (cachedId) {
      try {
        return DriveApp.getFileById(cachedId);
      } catch (e) {
        // File was moved/deleted — fall through to a fresh search.
      }
    }

    const vault = getVaultFolder();
    const file = searchFolderRecursive(vault, fileName);
    if (file) {
      putCache(idKey, file.getId());
    }
    return file;
  }

  /**
   * Resolves the vault folder, caching the ID in PropertiesService
   * so the lookup happens once per user (not once per preview).
   */
  function getVaultFolder() {
    const props = PropertiesService.getUserProperties();
    const cachedId = props.getProperty('vaultFolderId');
    if (cachedId) {
      try {
        return DriveApp.getFolderById(cachedId);
      } catch (e) {
        props.deleteProperty('vaultFolderId');
      }
    }

    const vaultFolderName = getSettings_().vaultFolderName;
    const folders = DriveApp.getFoldersByName(vaultFolderName);
    if (!folders.hasNext()) {
      throw new Error(`Vault folder "${vaultFolderName}" not found in Drive. Open 📄 Notes → Settings to update the folder name.`);
    }
    const folder = folders.next();
    props.setProperty('vaultFolderId', folder.getId());
    return folder;
  }

  /**
   * Recursively searches a folder and its subfolders for a file by name.
   * Returns the first match or null. Iterative (BFS) to avoid stack issues
   * on deep vaults.
   */
  function searchFolderRecursive(rootFolder, fileName) {
    const queue = [rootFolder];
    while (queue.length) {
      const folder = queue.shift();

      const files = folder.getFilesByName(fileName);
      if (files.hasNext()) {
        return files.next();
      }

      const subs = folder.getFolders();
      while (subs.hasNext()) {
        queue.push(subs.next());
      }
    }
    return null;
  }

  /**
   * Writes a value to cache and tracks the key so invalidateAll() can find it.
   */
  function putCache(key, value) {
    const cache = CacheService.getUserCache();
    // CacheService has a 100KB per-value limit. Big notes get skipped (still served, just not cached).
    if (value && value.length > 100 * 1024) {
      return;
    }
    cache.put(key, value, CONFIG.cacheTtlSeconds);
    trackKey(key);
  }

  function trackKey(key) {
    const props = PropertiesService.getUserProperties();
    const indexJson = props.getProperty(KEY_INDEX_PROP);
    let keys = [];
    if (indexJson) {
      try { keys = JSON.parse(indexJson); } catch (e) { keys = []; }
    }
    if (keys.indexOf(key) === -1) {
      keys.push(key);
      props.setProperty(KEY_INDEX_PROP, JSON.stringify(keys));
    }
  }

  return {
    getFileContent: getFileContent,
    invalidateAll: invalidateAll,
    invalidateFile: invalidateFile
  };
})();
