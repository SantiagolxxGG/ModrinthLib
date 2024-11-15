const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Class to interact with the Modrinth API for Minecraft mod management. :)
 * This class allows searching for mods, retrieving specific mod versions,
 * downloading and installing mods, and updating mods based on compatibility.
 */
class ModrinthAPI {
    /**
     * Initializes a new instance of the ModrinthAPI class.
     * @param {string} [modsDataFile='./mods.json'] - The path to the file where mod data is saved.
     */
    constructor(modsDataFile = './mods.json') {
        this.modsDataFile = modsDataFile;
    }

    /**
     * Retrieves basic information about a mod from Modrinth by its name.
     * @param {string} modName - The name of the mod to search for.
     * @returns {Promise<Object>} A promise that resolves to the mod information.
     * @throws {Error} Throws an error if no mod is found by the provided name.
     */
    static async getinfo(modName) {
        try {
            const response = await axios.get(`https://api.modrinth.com/v2/search`, {
                params: { query: modName, limit: 10 },
            });
            const mods = response.data.hits;
            if (mods.length === 0) {
                throw new Error(`Mod ${modName} not found.`);
            }
            const modInfo = mods[0];
            console.log('Mod Information:', modInfo);
            return modInfo;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Sets the file path for saving mod data.
     * @param {string} modsDataFile - The file path to save mod data.
     */
    setModFile(modsDataFile) {
        this.modsDataFile = modsDataFile;
    }

    /**
     * Retrieves compatible versions of a mod for a specified game or mod version and loader.
     * @param {string} modName - The name of the mod to search for.
     * @param {string} gameVersionOrModVersion - The Minecraft version or mod version to check compatibility.
     * @param {string} loader - The mod loader (e.g., 'forge' or 'fabric').
     * @returns {Promise<Array>} A promise that resolves to an array of compatible mod versions.
     * @throws {Error} Throws an error if no compatible versions are found.
     */
    async getmod(modName, gameVersionOrModVersion, loader) {
        try {
            const mods = await this.searchMods(modName);
            if (mods.length === 0) {
                throw new Error(`Mod ${modName} not found.`);
            }

            const mod = mods[0];
            const versions = await this.getModVersions(mod.project_id);

            let compatibleVersions;
            if (this.isSpecificModVersion(gameVersionOrModVersion)) {
                compatibleVersions = versions.filter(version => version.version_number === gameVersionOrModVersion);
            } else {
                compatibleVersions = versions.filter(version =>
                    version.game_versions.includes(gameVersionOrModVersion) &&
                    version.loaders.includes(loader) // Filters by loader
                );
            }

            if (compatibleVersions.length === 0) {
                throw new Error(`No compatible versions of ${modName} found for ${gameVersionOrModVersion} and loader ${loader}.`);
            }

            return compatibleVersions;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Downloads and installs the latest compatible version of a mod.
     * @param {string} modName - The name of the mod to download.
     * @param {string} gameVersionOrModVersion - The Minecraft version or mod version.
     * @param {string} loader - The mod loader (e.g., 'forge' or 'fabric').
     * @param {string} [minecraftModsFolder='./mods'] - The folder to install the mod to.
     * @returns {Promise<void>} A promise that resolves once the mod is installed.
     * @throws {Error} Throws an error if the mod cannot be downloaded or installed.
     */
    async download(modName, gameVersionOrModVersion, loader, minecraftModsFolder = './mods') {
        try {
            const versions = await this.getmod(modName, gameVersionOrModVersion, loader);
            const latestVersion = versions[0];

            await this.installMod(latestVersion.id, minecraftModsFolder);
            this.saveModInfo(modName, latestVersion.version_number);
        } catch (error) {
            throw error;
        }
    }

    /**
     * Deletes the old version of a mod from the Minecraft mods folder.
     * @param {string} modName - The name of the mod to delete.
     * @param {string} minecraftModsFolder - The folder containing Minecraft mods.
     */
    deleteOldMod(modName, minecraftModsFolder) {
        const modsData = this.loadModsData();
        const oldModFileName = Object.keys(modsData).find(key => key === modName);
        
        if (oldModFileName) {
            const oldModPath = path.join(minecraftModsFolder, oldModFileName);
            if (fs.existsSync(oldModPath)) {
                fs.unlinkSync(oldModPath);
            }
        }
    }

    /**
     * Updates all installed mods in the specified Minecraft mods folder.
     * Compares the installed mod version with the latest version from the Modrinth API.
     * @param {string} [minecraftModsFolder='./mods'] - The folder containing Minecraft mods.
     * @param {string} gameVersion - The Minecraft version to check compatibility with.
     * @returns {Promise<void>} A promise that resolves once all mods are updated.
     * @throws {Error} Throws an error if any mod cannot be updated.
     */
    async update(minecraftModsFolder = './mods', gameVersion) {
        try {
            const modsData = this.loadModsData();
            if (Object.keys(modsData).length === 0) {
                return;
            }

            for (const modName in modsData) {
                const installedVersion = modsData[modName];
                const versions = await this.getmod(modName, gameVersion, 'forge'); // Change loader as needed
                const latestVersion = versions[0];

                if (latestVersion.version_number !== installedVersion) {
                    this.deleteOldMod(modName, minecraftModsFolder);
                    await this.installMod(latestVersion.id, minecraftModsFolder);
                    this.saveModInfo(modName, latestVersion.version_number);
                }
            }
        } catch (error) {
            throw error;
        }
    }

    /**
     * Saves the mod's version information to the mods data file.
     * @param {string} modName - The name of the mod.
     * @param {string} version - The mod version to save.
     */
    saveModInfo(modName, version) {
        const modsData = this.loadModsData();
        modsData[modName] = version;
        fs.writeFileSync(this.modsDataFile, JSON.stringify(modsData, null, 2));
    }

    /**
     * Loads the mod data from the specified file.
     * @returns {Object} The loaded mod data.
     */
    loadModsData() {
        if (fs.existsSync(this.modsDataFile)) {
            const data = fs.readFileSync(this.modsDataFile);
            return JSON.parse(data);
        }
        return {};
    }

    /**
     * Determines whether a mod version is a specific mod version (i.e., contains a '-').
     * @param {string} version - The version string to check.
     * @returns {boolean} True if the version is specific, false otherwise.
     */
    isSpecificModVersion(version) {
        return version.includes('-');
    }

    /**
     * Searches for mods based on the given query.
     * @param {string} query - The search query for mod names.
     * @returns {Promise<Array>} A promise that resolves to an array of matching mods.
     * @throws {Error} Throws an error if the search fails.
     */
    async searchMods(query) {
        try {
            const response = await axios.get(`https://api.modrinth.com/v2/search`, {
                params: {
                    query,
                    limit: 10,
                }
            });
            return response.data.hits;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Retrieves all versions of a mod based on its ID.
     * @param {string} modId - The ID of the mod to retrieve versions for.
     * @returns {Promise<Array>} A promise that resolves to an array of mod versions.
     * @throws {Error} Throws an error if retrieving mod versions fails.
     */
    async getModVersions(modId) {
        try {
            const response = await axios.get(`https://api.modrinth.com/v2/project/${modId}/version`);
            return response.data;
        } catch (error) {
            throw error;
        }
    }

    /**
     * Installs the mod from the specified version ID to the Minecraft mods folder.
     * @param {string} versionId - The ID of the mod version to install.
     * @param {string} minecraftModsFolder - The folder to install the mod to.
     * @returns {Promise<void>} A promise that resolves once the mod is installed.
     */
    async installMod(versionId, minecraftModsFolder) {
        const downloadDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir);
        }

        await this.downloadMod(versionId, downloadDir);
        
        const files = fs.readdirSync(downloadDir);
        files.forEach(file => {
            const modPath = path.join(downloadDir, file);
            const destinationPath = path.join(minecraftModsFolder, file);
            fs.renameSync(modPath, destinationPath);
        });
    }

    /**
     * Downloads a mod version by its ID.
     * @param {string} versionId - The ID of the mod version to download.
     * @param {string} downloadDir - The directory to download the mod to.
     * @returns {Promise<void>} A promise that resolves once the download is complete.
     * @throws {Error} Throws an error if the download fails.
     */
    async downloadMod(versionId, downloadDir) {
        try {
            const versionData = await axios.get(`https://api.modrinth.com/v2/version/${versionId}`);
            const downloadUrl = versionData.data.files[0].url;
            const fileName = versionData.data.files[0].filename;
            const filePath = path.join(downloadDir, fileName);
            
            const writer = fs.createWriteStream(filePath);
            const response = await axios({
                url: downloadUrl,
                method: 'GET',
                responseType: 'stream'
            });

            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });
        } catch (error) {
            throw error;
        }
    }
}

module.exports = ModrinthAPI;
