//-----------------------------------------------------------------------------------
// <copyright company="Microsoft" file="xcodehelper.js">
//      Copyright (c) Microsoft Corporation.  All rights reserved.
// </copyright>
//-----------------------------------------------------------------------------------

var modify = require('./modification.js');
var xcode = require('xcode');
var path = require('path');

/*
  NOTE: All methods in this file, unless otherwise noted, are written such that they will not overwrite existing values / add duplicates.
*/

// Retrieves the relative path of the Plist file associated with a given configuration.
// config: the GUID of the config
// returns: relative path to the plist file
xcode.project.prototype.getPlistFileName = function (config) {
  if (!config || !this.pbxXCBuildConfigurationSection()[config]) {
    throw new ReferenceError('Invalid argument config for getPlistFileName');
  }
  var buildSettings = this.pbxXCBuildConfigurationSection()[config].buildSettings;
  if (!buildSettings['INFOPLIST_FILE']) {
    return undefined;
  }
  return buildSettings['INFOPLIST_FILE'].replace(/"/g, '');
};

// Returns a boolean which denotes whether there is a code sign entitlement in the PBXproj for the given configuration.
// config: the GUID of the config
// returns: whether a entitlements entry was found
xcode.project.prototype.hasEntitlements = function (config) {
  if (!config || !this.pbxXCBuildConfigurationSection()[config]) {
    throw new ReferenceError('Invalid argument config for hasEntitlements');
  }
  var buildSettings = this.pbxXCBuildConfigurationSection()[config].buildSettings;
  return buildSettings['CODE_SIGN_ENTITLEMENTS'] != null;
};

// Retrieves the relative path of the entitlements file associated with a given configuration.
// config: the GUID of the config
// returns: relative path to the entitlements file
xcode.project.prototype.getEntitlementsFileName = function (config) {
  if (!config || !this.pbxXCBuildConfigurationSection()[config]) {
    throw new ReferenceError('Invalid argument config for getEntitlementsFileName');
  }
  var buildSettings = this.pbxXCBuildConfigurationSection()[config].buildSettings;
  if (!buildSettings['CODE_SIGN_ENTITLEMENTS']) {
    return undefined;
  }
  return buildSettings['CODE_SIGN_ENTITLEMENTS'].replace(/"/g, '');
};

// Adds the given flag to ALL configurations if one of the primary configurations does not contain the flag.
//  NOTE: this may add duplicates to configurations.
// flag: the flag to set
xcode.project.prototype.addNewToOtherLinkerFlags = function (flag) {
  if (!flag) {
    throw new ReferenceError('Invalid argument flag for addNewToOtherLinkerFlags');
  }

  var configUUIDList = this.getNativeTargetConfigList();
  var found = true;
  for (var config of configUUIDList.map(function (uuid) { return uuid['value']; })) {
    var buildSettings = this.pbxXCBuildConfigurationSection()[config].buildSettings;
    if (!buildSettings['OTHER_LDFLAGS'] || buildSettings['OTHER_LDFLAGS'].indexOf(flag) < 0) {
      found = false;
    }
  }

  if (!found) {
    this.addToOtherLinkerFlags(flag);
  }
};

// Adds a force_load flag for the given library to the given configuration.
// config: the GUID of the config
// library: the path to the library to force_load
xcode.project.prototype.addForceLoadLibrary = function (config, library) {
  if (!config || !this.pbxXCBuildConfigurationSection()[config]) {
    throw new ReferenceError('Invalid argument config for addForceLoadLibrary');
  }
  if (!library) {
    throw new ReferenceError('Invalid argument library for addForceLoadLibrary');
  }
  var buildSettings = this.pbxXCBuildConfigurationSection()[config].buildSettings;
  if (buildSettings['OTHER_LDFLAGS'].indexOf(library) < 0) {
    buildSettings['OTHER_LDFLAGS'].push('\"-force_load\"');
    buildSettings['OTHER_LDFLAGS'].push(library);
  }
};

// Returns the name of project file.
// returns: the project file name.
xcode.project.prototype.getProjectName = function () {
  if (!this.filepath) {
    throw ReferenceError('No xcodeproj filepath set');
  }
  var subpath = path.parse(this.filepath).dir;
  if (!subpath) {
    throw ReferenceError('Bad xcodeproj filepath');
  }
  var name = path.parse(subpath).name;
  if (!name) {
    throw ReferenceError('Bad xcodeproj filepath');
  }
  return name;
};

// Adds a library to the given configuration's header search paths.
// config: the GUID of the config
// path: the path to add to the header search paths
xcode.project.prototype.addHeaderSearchPath = function (config, path) {
  if (!config || !this.pbxXCBuildConfigurationSection()[config]) {
    throw new ReferenceError('Invalid argument config for addHeaderSearchPath');
  }
  if (!path) {
    throw new ReferenceError('Invalid argument path for addHeaderSearchPath');
  }
  var buildSettings = this.pbxXCBuildConfigurationSection()[config].buildSettings;
  modify.addToUniqueKeyedArray(buildSettings, 'HEADER_SEARCH_PATHS', path);
};

// Adds a library to the given configuration's library search paths.
// config: the GUID of the config
// path: the path to add to the library search paths
xcode.project.prototype.addLibrarySearchPath = function (config, path) {
  if (!config || !this.pbxXCBuildConfigurationSection()[config]) {
    throw new ReferenceError('Invalid argument config for addLibrarySearchPath');
  }
  if (!path) {
    throw new ReferenceError('Invalid argument path for addLibrarySearchPath');
  }
  var buildSettings = this.pbxXCBuildConfigurationSection()[config].buildSettings;
  modify.addToUniqueKeyedArray(buildSettings, 'LIBRARY_SEARCH_PATHS', path);
};

// Disables bitcode for the given configuration. NOTE: this method will override any existing settings for ENABLE_BITCODE
// config: the GUID of the config
xcode.project.prototype.disableBitcode = function (config) {
  if (!config || !this.pbxXCBuildConfigurationSection()[config]) {
    throw new ReferenceError('Invalid argument config for disableBitcode');
  }
  var buildSettings = this.pbxXCBuildConfigurationSection()[config].buildSettings;
  modify.addUniqueKeyedValue(buildSettings, 'ENABLE_BITCODE', 'NO');
};

// Sets the name of the entitlements file associated with the given configuration.
// config: the GUID of the config
// name: the name of the entitlements file.
xcode.project.prototype.setEntitlementsFileName = function (config, name) {
  if (!config || !this.pbxXCBuildConfigurationSection()[config]) {
    throw new ReferenceError('Invalid argument config for setEntitlementsFileName');
  }
  if (!name) {
    throw new ReferenceError('Invalid argument name for setEntitlementsFileName');
  }
  var buildSettings = this.pbxXCBuildConfigurationSection()[config].buildSettings;
  modify.addNewUniqueKeyedValue(buildSettings, 'CODE_SIGN_ENTITLEMENTS', name);
};

// Returns the list of all the configuration GUIDs associated with the primary native target.
// returns: the list of all the configuration GUIDs associated with the primary native target
xcode.project.prototype.getNativeTargetConfigList = function () {
  var listUUID = this.getPrimaryNativeTarget()['buildConfigurationList'];
  return this.pbxXCConfigurationList()[listUUID]['buildConfigurations'];
};

// Returns the GUID corresponding to the primary native target.
// returns: the GUID corresponding to the primary native target.
xcode.project.prototype.getPrimaryNativeTargetUUID = function () {
  var nativeTarget = this.pbxNativeTargetSection();
  return Object.keys(nativeTarget)[0];
};

// Returns the dictionary associated with the primary native target
// returns: the dictionary associated with the primary native target
xcode.project.prototype.getPrimaryNativeTarget = function () {
  var nativeTarget = this.pbxNativeTargetSection();
  return nativeTarget[this.getPrimaryNativeTargetUUID()];
};

// Adds a value to pbxProjectSection by traversing the given path of keys (adding the keys if they don't already exist) and then adding the key/value pair to the leaf-node of the path.
// project: the reference to the parsed xcode project object
// path: the path traverse from the root node of the pbxProjectSection, adding keys if they don't exist
// key: the key to add to the leaf node of the path
// value: the value associated with the given key
var addDeepProjectAttribute = function (project, path, key, value) {
  var proj = project.pbxProjectSection()[project.hash.project.rootObject];
  var cursor = proj['attributes'];

  var subPath;
  while (path.length > 0) {
    subPath = path.shift();
    modify.addUniqueKeyedMap(cursor, subPath);
    cursor = cursor[subPath];
  }

  modify.addUniqueKeyedValue(cursor, key, value);
};

// Enables keychain sharing in the PBXProject settings.
xcode.project.prototype.enableKeychainSharing = function () {
  addDeepProjectAttribute(this, ['TargetAttributes', this.getPrimaryNativeTargetUUID(), 'SystemCapabilities', 'com.apple.Keychain'], 'enabled', 1);
};

module.exports = xcode;

// SIG // Begin signature block
// SIG // MIIdpgYJKoZIhvcNAQcCoIIdlzCCHZMCAQExCzAJBgUr
// SIG // DgMCGgUAMGcGCisGAQQBgjcCAQSgWTBXMDIGCisGAQQB
// SIG // gjcCAR4wJAIBAQQQEODJBs441BGiowAQS9NQkAIBAAIB
// SIG // AAIBAAIBAAIBADAhMAkGBSsOAwIaBQAEFKC32W5exdF8
// SIG // vhd2b/qNH2GNkdrzoIIYZDCCBMMwggOroAMCAQICEzMA
// SIG // AADGeIA2AXUaaXIAAAAAAMYwDQYJKoZIhvcNAQEFBQAw
// SIG // dzELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0
// SIG // b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1p
// SIG // Y3Jvc29mdCBDb3Jwb3JhdGlvbjEhMB8GA1UEAxMYTWlj
// SIG // cm9zb2Z0IFRpbWUtU3RhbXAgUENBMB4XDTE2MDkwNzE3
// SIG // NTg1M1oXDTE4MDkwNzE3NTg1M1owgbMxCzAJBgNVBAYT
// SIG // AlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQH
// SIG // EwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29y
// SIG // cG9yYXRpb24xDTALBgNVBAsTBE1PUFIxJzAlBgNVBAsT
// SIG // Hm5DaXBoZXIgRFNFIEVTTjpGNTI4LTM3NzctOEE3NjEl
// SIG // MCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUtU3RhbXAgU2Vy
// SIG // dmljZTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC
// SIG // ggEBAK0LIxuoyogoFDbjw2hdBoQodUGHEqicqTQCYKGt
// SIG // RrYKDayl0w1GReivnhzzc17/b/y2mC2V9hsjiPZRs+eb
// SIG // V1b9TcuiNbnlYctnFAIXRPiJFUegLQqPAK/Lh8BKZMk4
// SIG // vuGMK+rDhjO2K8AasPknmgYwcDjfvBPEgM9KYJhx4+HD
// SIG // b7eQOkfiEAurcohcfiRDDtaqpyE0iNqsd5Dl4Q98kxeG
// SIG // I40Z08dxxqX2sFAsn1rMWrABx5SCxAH7FQJl7G6+FwAt
// SIG // hwWRil6NN4wJn75m4G5t1eCgStvelJ56fdkWZsABKi9P
// SIG // J/pa5fjxHesOBPZrRR4UfcBkltvQuf9Gzmq/cx8CAwEA
// SIG // AaOCAQkwggEFMB0GA1UdDgQWBBTUv/YysIgxD+YZlPE+
// SIG // vzH6WwIPCTAfBgNVHSMEGDAWgBQjNPjZUkZwCu1A+3b7
// SIG // syuwwzWzDzBUBgNVHR8ETTBLMEmgR6BFhkNodHRwOi8v
// SIG // Y3JsLm1pY3Jvc29mdC5jb20vcGtpL2NybC9wcm9kdWN0
// SIG // cy9NaWNyb3NvZnRUaW1lU3RhbXBQQ0EuY3JsMFgGCCsG
// SIG // AQUFBwEBBEwwSjBIBggrBgEFBQcwAoY8aHR0cDovL3d3
// SIG // dy5taWNyb3NvZnQuY29tL3BraS9jZXJ0cy9NaWNyb3Nv
// SIG // ZnRUaW1lU3RhbXBQQ0EuY3J0MBMGA1UdJQQMMAoGCCsG
// SIG // AQUFBwMIMA0GCSqGSIb3DQEBBQUAA4IBAQCYWwDc76NI
// SIG // i+RQOWeUJMBvj75A3zmmLE2JLKhZPjIKasz8XBcEmDBP
// SIG // 0v8MooXeJcIEOgj3TuQBs95uQ2VO4D0uRXApddJPaU8W
// SIG // eLPOez7vGaxNsa51MlIkBZeQ2Eja6ET7kGEWWV7NsStV
// SIG // lZ9SXMHAMCcH7tZMJ3mzw/dKNQ0ZTaMxxdzTGiKNJwk0
// SIG // QDfOnkgcinWKQ53YKVS0qDdsFJ7IeGy3GaqHeKM3ZL4B
// SIG // kuzdQH9fERBUlAVa2n+zKEsSnjSCiy8oYDcQ8Wca1IJz
// SIG // 298y+98zo+NANSG8N1syaG/L2CvoAWFjkZeI5urwsAKv
// SIG // +fdc/N+BwzR+tFHdGx/sUuz6MIIGBzCCA++gAwIBAgIK
// SIG // YRZoNAAAAAAAHDANBgkqhkiG9w0BAQUFADBfMRMwEQYK
// SIG // CZImiZPyLGQBGRYDY29tMRkwFwYKCZImiZPyLGQBGRYJ
// SIG // bWljcm9zb2Z0MS0wKwYDVQQDEyRNaWNyb3NvZnQgUm9v
// SIG // dCBDZXJ0aWZpY2F0ZSBBdXRob3JpdHkwHhcNMDcwNDAz
// SIG // MTI1MzA5WhcNMjEwNDAzMTMwMzA5WjB3MQswCQYDVQQG
// SIG // EwJVUzETMBEGA1UECBMKV2FzaGluZ3RvbjEQMA4GA1UE
// SIG // BxMHUmVkbW9uZDEeMBwGA1UEChMVTWljcm9zb2Z0IENv
// SIG // cnBvcmF0aW9uMSEwHwYDVQQDExhNaWNyb3NvZnQgVGlt
// SIG // ZS1TdGFtcCBQQ0EwggEiMA0GCSqGSIb3DQEBAQUAA4IB
// SIG // DwAwggEKAoIBAQCfoWyx39tIkip8ay4Z4b3i48WZUSNQ
// SIG // rc7dGE4kD+7Rp9FMrXQwIBHrB9VUlRVJlBtCkq6YXDAm
// SIG // 2gBr6Hu97IkHD/cOBJjwicwfyzMkh53y9GccLPx754gd
// SIG // 6udOo6HBI1PKjfpFzwnQXq/QsEIEovmmbJNn1yjcRlOw
// SIG // htDlKEYuJ6yGT1VSDOQDLPtqkJAwbofzWTCd+n7Wl7Po
// SIG // IZd++NIT8wi3U21StEWQn0gASkdmEScpZqiX5NMGgUqi
// SIG // +YSnEUcUCYKfhO1VeP4Bmh1QCIUAEDBG7bfeI0a7xC1U
// SIG // n68eeEExd8yb3zuDk6FhArUdDbH895uyAc4iS1T/+QXD
// SIG // wiALAgMBAAGjggGrMIIBpzAPBgNVHRMBAf8EBTADAQH/
// SIG // MB0GA1UdDgQWBBQjNPjZUkZwCu1A+3b7syuwwzWzDzAL
// SIG // BgNVHQ8EBAMCAYYwEAYJKwYBBAGCNxUBBAMCAQAwgZgG
// SIG // A1UdIwSBkDCBjYAUDqyCYEBWJ5flJRP8KuEKU5VZ5KSh
// SIG // Y6RhMF8xEzARBgoJkiaJk/IsZAEZFgNjb20xGTAXBgoJ
// SIG // kiaJk/IsZAEZFgltaWNyb3NvZnQxLTArBgNVBAMTJE1p
// SIG // Y3Jvc29mdCBSb290IENlcnRpZmljYXRlIEF1dGhvcml0
// SIG // eYIQea0WoUqgpa1Mc1j0BxMuZTBQBgNVHR8ESTBHMEWg
// SIG // Q6BBhj9odHRwOi8vY3JsLm1pY3Jvc29mdC5jb20vcGtp
// SIG // L2NybC9wcm9kdWN0cy9taWNyb3NvZnRyb290Y2VydC5j
// SIG // cmwwVAYIKwYBBQUHAQEESDBGMEQGCCsGAQUFBzAChjho
// SIG // dHRwOi8vd3d3Lm1pY3Jvc29mdC5jb20vcGtpL2NlcnRz
// SIG // L01pY3Jvc29mdFJvb3RDZXJ0LmNydDATBgNVHSUEDDAK
// SIG // BggrBgEFBQcDCDANBgkqhkiG9w0BAQUFAAOCAgEAEJeK
// SIG // w1wDRDbd6bStd9vOeVFNAbEudHFbbQwTq86+e4+4LtQS
// SIG // ooxtYrhXAstOIBNQmd16QOJXu69YmhzhHQGGrLt48ovQ
// SIG // 7DsB7uK+jwoFyI1I4vBTFd1Pq5Lk541q1YDB5pTyBi+F
// SIG // A+mRKiQicPv2/OR4mS4N9wficLwYTp2OawpylbihOZxn
// SIG // LcVRDupiXD8WmIsgP+IHGjL5zDFKdjE9K3ILyOpwPf+F
// SIG // ChPfwgphjvDXuBfrTot/xTUrXqO/67x9C0J71FNyIe4w
// SIG // yrt4ZVxbARcKFA7S2hSY9Ty5ZlizLS/n+YWGzFFW6J1w
// SIG // lGysOUzU9nm/qhh6YinvopspNAZ3GmLJPR5tH4LwC8cs
// SIG // u89Ds+X57H2146SodDW4TsVxIxImdgs8UoxxWkZDFLyz
// SIG // s7BNZ8ifQv+AeSGAnhUwZuhCEl4ayJ4iIdBD6Svpu/RI
// SIG // zCzU2DKATCYqSCRfWupW76bemZ3KOm+9gSd0BhHudiG/
// SIG // m4LBJ1S2sWo9iaF2YbRuoROmv6pH8BJv/YoybLL+31HI
// SIG // jCPJZr2dHYcSZAI9La9Zj7jkIeW1sMpjtHhUBdRBLlCs
// SIG // lLCleKuzoJZ1GtmShxN1Ii8yqAhuoFuMJb+g74TKIdbr
// SIG // Hk/Jmu5J4PcBZW+JC33Iacjmbuqnl84xKf8OxVtc2E0b
// SIG // odj6L54/LlUWa8kTo/0wggYQMIID+KADAgECAhMzAAAA
// SIG // ZEeElIbbQRk4AAAAAABkMA0GCSqGSIb3DQEBCwUAMH4x
// SIG // CzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9u
// SIG // MRAwDgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNy
// SIG // b3NvZnQgQ29ycG9yYXRpb24xKDAmBgNVBAMTH01pY3Jv
// SIG // c29mdCBDb2RlIFNpZ25pbmcgUENBIDIwMTEwHhcNMTUx
// SIG // MDI4MjAzMTQ2WhcNMTcwMTI4MjAzMTQ2WjCBgzELMAkG
// SIG // A1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0b24xEDAO
// SIG // BgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1pY3Jvc29m
// SIG // dCBDb3Jwb3JhdGlvbjENMAsGA1UECxMETU9QUjEeMBwG
// SIG // A1UEAxMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMIIBIjAN
// SIG // BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAky7a2OY+
// SIG // mNkbD2RfTahYTRQ793qE/DwRMTrvicJKLUGlSF3dEp7v
// SIG // q2YoNNV9KlV7TE2K8sDxstNSFYu2swi4i1AL3X/7agmg
// SIG // 3GcExPHfvHUYIEC+eCyZVt3u9S7dPkL5Wh8wrgEUirCC
// SIG // tVGg4m1l/vcYCo0wbU06p8XzNi3uXyygkgCxHEziy/f/
// SIG // JCV/14/A3ZduzrIXtsccRKckyn6B5uYxuRbZXT7RaO6+
// SIG // zUjQhiyu3A4hwcCKw+4bk1kT9sY7gHIYiFP7q78wPqB3
// SIG // vVKIv3rY6LCTraEbjNR+phBQEL7hyBxk+ocu+8RHZhbA
// SIG // hHs2r1+6hURsAg8t4LAOG6I+JQIDAQABo4IBfzCCAXsw
// SIG // HwYDVR0lBBgwFgYIKwYBBQUHAwMGCisGAQQBgjdMCAEw
// SIG // HQYDVR0OBBYEFFhWcQTwvbsz9YNozOeARvdXr9IiMFEG
// SIG // A1UdEQRKMEikRjBEMQ0wCwYDVQQLEwRNT1BSMTMwMQYD
// SIG // VQQFEyozMTY0Mis0OWU4YzNmMy0yMzU5LTQ3ZjYtYTNi
// SIG // ZS02YzhjNDc1MWM0YjYwHwYDVR0jBBgwFoAUSG5k5VAF
// SIG // 04KqFzc3IrVtqMp1ApUwVAYDVR0fBE0wSzBJoEegRYZD
// SIG // aHR0cDovL3d3dy5taWNyb3NvZnQuY29tL3BraW9wcy9j
// SIG // cmwvTWljQ29kU2lnUENBMjAxMV8yMDExLTA3LTA4LmNy
// SIG // bDBhBggrBgEFBQcBAQRVMFMwUQYIKwYBBQUHMAKGRWh0
// SIG // dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lvcHMvY2Vy
// SIG // dHMvTWljQ29kU2lnUENBMjAxMV8yMDExLTA3LTA4LmNy
// SIG // dDAMBgNVHRMBAf8EAjAAMA0GCSqGSIb3DQEBCwUAA4IC
// SIG // AQCI4gxkQx3dXK6MO4UktZ1A1r1mrFtXNdn06DrARZkQ
// SIG // Tdu0kOTLdlGBCfCzk0309RLkvUgnFKpvLddrg9TGp3n8
// SIG // 0yUbRsp2AogyrlBU+gP5ggHFi7NjGEpj5bH+FDsMw9Py
// SIG // gLg8JelgsvBVudw1SgUt625nY7w1vrwk+cDd58TvAyJQ
// SIG // FAW1zJ+0ySgB9lu2vwg0NKetOyL7dxe3KoRLaztUcqXo
// SIG // YW5CkI+Mv3m8HOeqlhyfFTYxPB5YXyQJPKQJYh8zC9b9
// SIG // 0JXLT7raM7mQ94ygDuFmlaiZ+QSUR3XVupdEngrmZgUB
// SIG // 5jX13M+Pl2Vv7PPFU3xlo3Uhj1wtupNC81epoxGhJ0tR
// SIG // uLdEajD/dCZ0xIniesRXCKSC4HCL3BMnSwVXtIoj/QFy
// SIG // mFYwD5+sAZuvRSgkKyD1rDA7MPcEI2i/Bh5OMAo9App4
// SIG // sR0Gp049oSkXNhvRi/au7QG6NJBTSBbNBGJG8Qp+5QTh
// SIG // KoQUk8mj0ugr4yWRsA9JTbmqVw7u9suB5OKYBMUN4hL/
// SIG // yI+aFVsE/KJInvnxSzXJ1YHka45ADYMKAMl+fLdIqm3n
// SIG // x6rIN0RkoDAbvTAAXGehUCsIod049A1T3IJyUJXt3OsT
// SIG // d3WabhIBXICYfxMg10naaWcyUePgW3+VwP0XLKu4O1+8
// SIG // ZeGyaDSi33GnzmmyYacX3BTqMDCCB3owggVioAMCAQIC
// SIG // CmEOkNIAAAAAAAMwDQYJKoZIhvcNAQELBQAwgYgxCzAJ
// SIG // BgNVBAYTAlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAw
// SIG // DgYDVQQHEwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3Nv
// SIG // ZnQgQ29ycG9yYXRpb24xMjAwBgNVBAMTKU1pY3Jvc29m
// SIG // dCBSb290IENlcnRpZmljYXRlIEF1dGhvcml0eSAyMDEx
// SIG // MB4XDTExMDcwODIwNTkwOVoXDTI2MDcwODIxMDkwOVow
// SIG // fjELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0
// SIG // b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1p
// SIG // Y3Jvc29mdCBDb3Jwb3JhdGlvbjEoMCYGA1UEAxMfTWlj
// SIG // cm9zb2Z0IENvZGUgU2lnbmluZyBQQ0EgMjAxMTCCAiIw
// SIG // DQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAKvw+nIQ
// SIG // HC6t2G6qghBNNLrytlghn0IbKmvpWlCquAY4GgRJun/D
// SIG // DB7dN2vGEtgL8DjCmQawyDnVARQxQtOJDXlkh36UYCRs
// SIG // r55JnOloXtLfm1OyCizDr9mpK656Ca/XllnKYBoF6WZ2
// SIG // 6DJSJhIv56sIUM+zRLdd2MQuA3WraPPLbfM6XKEW9Ea6
// SIG // 4DhkrG5kNXimoGMPLdNAk/jj3gcN1Vx5pUkp5w2+oBN3
// SIG // vpQ97/vjK1oQH01WKKJ6cuASOrdJXtjt7UORg9l7snuG
// SIG // G9k+sYxd6IlPhBryoS9Z5JA7La4zWMW3Pv4y07MDPbGy
// SIG // r5I4ftKdgCz1TlaRITUlwzluZH9TupwPrRkjhMv0ugOG
// SIG // jfdf8NBSv4yUh7zAIXQlXxgotswnKDglmDlKNs98sZKu
// SIG // HCOnqWbsYR9q4ShJnV+I4iVd0yFLPlLEtVc/JAPw0Xpb
// SIG // L9Uj43BdD1FGd7P4AOG8rAKCX9vAFbO9G9RVS+c5oQ/p
// SIG // I0m8GLhEfEXkwcNyeuBy5yTfv0aZxe/CHFfbg43sTUkw
// SIG // p6uO3+xbn6/83bBm4sGXgXvt1u1L50kppxMopqd9Z4Dm
// SIG // imJ4X7IvhNdXnFy/dygo8e1twyiPLI9AN0/B4YVEicQJ
// SIG // TMXUpUMvdJX3bvh4IFgsE11glZo+TzOE2rCIF96eTvSW
// SIG // sLxGoGyY0uDWiIwLAgMBAAGjggHtMIIB6TAQBgkrBgEE
// SIG // AYI3FQEEAwIBADAdBgNVHQ4EFgQUSG5k5VAF04KqFzc3
// SIG // IrVtqMp1ApUwGQYJKwYBBAGCNxQCBAweCgBTAHUAYgBD
// SIG // AEEwCwYDVR0PBAQDAgGGMA8GA1UdEwEB/wQFMAMBAf8w
// SIG // HwYDVR0jBBgwFoAUci06AjGQQ7kUBU7h6qfHMdEjiTQw
// SIG // WgYDVR0fBFMwUTBPoE2gS4ZJaHR0cDovL2NybC5taWNy
// SIG // b3NvZnQuY29tL3BraS9jcmwvcHJvZHVjdHMvTWljUm9v
// SIG // Q2VyQXV0MjAxMV8yMDExXzAzXzIyLmNybDBeBggrBgEF
// SIG // BQcBAQRSMFAwTgYIKwYBBQUHMAKGQmh0dHA6Ly93d3cu
// SIG // bWljcm9zb2Z0LmNvbS9wa2kvY2VydHMvTWljUm9vQ2Vy
// SIG // QXV0MjAxMV8yMDExXzAzXzIyLmNydDCBnwYDVR0gBIGX
// SIG // MIGUMIGRBgkrBgEEAYI3LgMwgYMwPwYIKwYBBQUHAgEW
// SIG // M2h0dHA6Ly93d3cubWljcm9zb2Z0LmNvbS9wa2lvcHMv
// SIG // ZG9jcy9wcmltYXJ5Y3BzLmh0bTBABggrBgEFBQcCAjA0
// SIG // HjIgHQBMAGUAZwBhAGwAXwBwAG8AbABpAGMAeQBfAHMA
// SIG // dABhAHQAZQBtAGUAbgB0AC4gHTANBgkqhkiG9w0BAQsF
// SIG // AAOCAgEAZ/KGpZjgVHkaLtPYdGcimwuWEeFjkplCln3S
// SIG // eQyQwWVfLiw++MNy0W2D/r4/6ArKO79HqaPzadtjvyI1
// SIG // pZddZYSQfYtGUFXYDJJ80hpLHPM8QotS0LD9a+M+By4p
// SIG // m+Y9G6XUtR13lDni6WTJRD14eiPzE32mkHSDjfTLJgJG
// SIG // KsKKELukqQUMm+1o+mgulaAqPyprWEljHwlpblqYluSD
// SIG // 9MCP80Yr3vw70L01724lruWvJ+3Q3fMOr5kol5hNDj0L
// SIG // 8giJ1h/DMhji8MUtzluetEk5CsYKwsatruWy2dsViFFF
// SIG // WDgycScaf7H0J/jeLDogaZiyWYlobm+nt3TDQAUGpgEq
// SIG // KD6CPxNNZgvAs0314Y9/HG8VfUWnduVAKmWjw11SYobD
// SIG // HWM2l4bf2vP48hahmifhzaWX0O5dY0HjWwechz4GdwbR
// SIG // BrF1HxS+YWG18NzGGwS+30HHDiju3mUv7Jf2oVyW2ADW
// SIG // oUa9WfOXpQlLSBCZgB/QACnFsZulP0V3HjXG0qKin3p6
// SIG // IvpIlR+r+0cjgPWe+L9rt0uX4ut1eBrs6jeZeRhL/9az
// SIG // I2h15q/6/IvrC4DqaTuv/DDtBEyO3991bWORPdGdVk5P
// SIG // v4BXIqF4ETIheu9BCrE/+6jMpF3BoYibV3FWTkhFwELJ
// SIG // m3ZbCoBIa/15n8G9bW1qyVJzEw16UM0xggSuMIIEqgIB
// SIG // ATCBlTB+MQswCQYDVQQGEwJVUzETMBEGA1UECBMKV2Fz
// SIG // aGluZ3RvbjEQMA4GA1UEBxMHUmVkbW9uZDEeMBwGA1UE
// SIG // ChMVTWljcm9zb2Z0IENvcnBvcmF0aW9uMSgwJgYDVQQD
// SIG // Ex9NaWNyb3NvZnQgQ29kZSBTaWduaW5nIFBDQSAyMDEx
// SIG // AhMzAAAAZEeElIbbQRk4AAAAAABkMAkGBSsOAwIaBQCg
// SIG // gcIwGQYJKoZIhvcNAQkDMQwGCisGAQQBgjcCAQQwHAYK
// SIG // KwYBBAGCNwIBCzEOMAwGCisGAQQBgjcCARUwIwYJKoZI
// SIG // hvcNAQkEMRYEFE3ds2OkR+bE8Wwhicc6L4X9tvyrMGIG
// SIG // CisGAQQBgjcCAQwxVDBSoDSAMgBNAGkAYwByAG8AcwBv
// SIG // AGYAdAAgAEMAbwByAHAAbwByAGEAdABpAG8AbgAgACgA
// SIG // UgApoRqAGGh0dHA6Ly93d3cubWljcm9zb2Z0LmNvbTAN
// SIG // BgkqhkiG9w0BAQEFAASCAQAce3smWgMwaTybLZ/oAGIM
// SIG // bvNEpm2/hrbItZEmbw5Mrb0DIIOd+6+1VmD3ZjL9b11j
// SIG // Ge93ekmj9oHcLmajKlmVBa67pnha+/UOpKp5FRy1UWIe
// SIG // sVXkCyQHgDpMSgbnHrWjeIcVDalrou3JHZA7E9sjBFcV
// SIG // wHSAgMISQ6yVRo4NYTRkafRZUIXDt7T/2K462IpVrUlf
// SIG // 5A1ooeF1IJ+8BBD7Q1Vzf2tQyS3JvUYc2AutixoDYFG4
// SIG // taHWIyW+SPTHc6YXynkP2RkE5yDsVKxikX/GhVhbc8jq
// SIG // xDmc64dy2aR07+CHtpS/AS8+nktu/fV0vUwVzms3nYEk
// SIG // xyqwRWUVTl0soYICKDCCAiQGCSqGSIb3DQEJBjGCAhUw
// SIG // ggIRAgEBMIGOMHcxCzAJBgNVBAYTAlVTMRMwEQYDVQQI
// SIG // EwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4w
// SIG // HAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xITAf
// SIG // BgNVBAMTGE1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQQIT
// SIG // MwAAAMZ4gDYBdRppcgAAAAAAxjAJBgUrDgMCGgUAoF0w
// SIG // GAYJKoZIhvcNAQkDMQsGCSqGSIb3DQEHATAcBgkqhkiG
// SIG // 9w0BCQUxDxcNMTYxMDMxMTg0MjM1WjAjBgkqhkiG9w0B
// SIG // CQQxFgQUbWkpnfsF/5yfbsRpY8YrCBPhy7MwDQYJKoZI
// SIG // hvcNAQEFBQAEggEAngDOLLEGvsOTCDAMUdM6/3xXF0IR
// SIG // buIblvUiLzbDx+KzKwwcysjVG0eb1r+d/JqkmkLqx2to
// SIG // gBLfZB/b/bbKy0uWZIocMF4kp8Yav7zDXuy0hAAayzJQ
// SIG // yHkiBG69kwUapx2xQ53ozWH289Ko5zZjnw3og9zIZQmb
// SIG // P23ReP56wLF/At+qRT52OPhoncd0FClp+9zf2EisgefV
// SIG // HJY1jA3KijYy+zgVWByO47lSfmexPXibSd+I1MurBh/0
// SIG // agVhk/FO9+AnBYzoUvJ25KynbEos4QNqm7e4HB5I4Q1C
// SIG // BvRp/p/AYE55I0SZA8qqvsmDF1phrLYaLp/JAv+Hy9md
// SIG // 1AN2qw==
// SIG // End signature block
