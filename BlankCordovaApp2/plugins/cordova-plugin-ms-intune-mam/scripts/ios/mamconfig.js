//-----------------------------------------------------------------------------------
// <copyright company="Microsoft" file="mamconfig.js">
//      Copyright (c) Microsoft Corporation.  All rights reserved.
// </copyright>
//-----------------------------------------------------------------------------------

var fs = require('fs');
var PlistHelper = require('./plisthelper.js');
var plist = require('plist');
var exec = require('child_process').exec;
var path = require('path');
var pluginCommon = require('../common.js');
var Q;

var getMatchingFileFromList = function (filename, files) {
  return files.filter(function (file) { return file.filepath === filename; })[0];
};

// Performs all the configuration steps for the supplied plist/entitlements files.
// entitlementMap: a dictionary with entitlement filenames as the key and an array of associated plists as the corresponding value
//  (should be the return value of getPlistEntitlementMapping)
// fileNameMap: a dictionary with filenames as the key and parsed file data as the corresponding value
var configureEntitlementsAndPlists = function (entitlementMap, files) {
  for (var entitlement in entitlementMap) {
    var entitlementObject = getMatchingFileFromList(entitlement, files);
    var plists = entitlementMap[entitlement];

    for (var plist of plists) {
      console.log('Performing configuration steps for ' + entitlement + ' and ' + plist);
      var plistObject = getMatchingFileFromList(plist, files);

      configureKeychainAccess(plistObject, entitlementObject);
      moveStoryboardsNibs(plistObject);
      addIntuneURLSchemes(plistObject);
      addIntuneAppQueriesSchemes(plistObject);
      configureAppGroupKey(plistObject, entitlementObject);
      setMdmlessSettings(plistObject);
    }
  }
};

// Sets the appropriate plist values to allow MDM-less MAM to work in the app on startup
// plist: The plist object
var setMdmlessSettings = function (plist) {
  console.log('Starting Step: Setting MDM-less MAM Settings');
  plist.setMamPolicyRequired(true);
  plist.setAutoEnrollOnLaunch(true);
};

// Makes the necessary configuration changes to the entitlements.
// plist: the plist object to pull the bundle ID from
// entitlements: the entitlements file to modify
var configureKeychainAccess = function (plist, entitlements) {
  console.log('Starting Step: Configuring Keychain Access');

  var bundleId = plist.getBundleIdentifier();

  entitlements.addKeyChainAccessGroup(bundleId);
  entitlements.addKeyChainAccessGroup('com.microsoft.intune.mam');
  entitlements.addKeyChainAccessGroup('com.microsoft.adalcache');
  entitlements.addKeyChainAccessGroup('com.microsoft.workplacejoin');
};

// Moves existing Storyboards/Nibs to IntuneMAMSettings so MAM can properly handle them.
// plist: the plist JSON to modify
var moveStoryboardsNibs = function (plist) {
  console.log('Starting Step: Moving Storyboards and Nibs');
  var storyboard = plist.getMainStoryboard();
  var storyboardIpad = plist.getMainStoryboardIpad();
  var nib = plist.getMainNib();
  var nibIpad = plist.getMainNibIpad();

  if (storyboard) plist.addStoryboardOrNibToIntune(storyboard, 'UIMainStoryboardFile');
  if (storyboardIpad) plist.addStoryboardOrNibToIntune(storyboardIpad, 'UIMainStoryboardFile~ipad');
  if (nib) plist.addStoryboardOrNibToIntune(nib, 'NSMainnibFile');
  if (nibIpad) plist.addStoryboardOrNibToIntune(nibIpad, 'NSMainnibFile~ipad');
  plist.deleteMainStoryboard();
  plist.deleteMainStoryboardIpad();
  plist.deleteMainNib();
  plist.deleteMainNibIpad();
};

// Returns whether the specified scheme is already an -intunemam scheme.
// scheme: the scheme to check
// returns: whether this scheme is intunemam or not
var isURLSchemeIntuneMAM = function (scheme) {
  return scheme.indexOf('-intunemam') >= 0;
};

// Adds -intuneman variants of all existing CFBundleURLSchemes.
// plist: the plist JSON to modify
var addIntuneURLSchemes = function (plist) {
  console.log('Starting Step: Adding Intune URL Schemes');

  var urlTypes = plist.getURLTypes();
  if (!urlTypes) {
    return;
  }
  for (var urlType of urlTypes) {
    for (var scheme of plist.getURLSchemesFromURLType(urlType)) {
      if (!isURLSchemeIntuneMAM(scheme)) {
        plist.addURLSchemeToURLType(urlType, scheme + '-intunemam');
      }
    }
  }
};

// Adds -intunemam versions of all existing LSApplicationQueriesSchemes (except mailto) and adds core MAM schemes.
// plist: the plist JSON to modify
var addIntuneAppQueriesSchemes = function (plist) {
  console.log('Starting Step: Adding Intune Application Queries');

  plist.addApplicationQueriesScheme('http-intunemam');
  plist.addApplicationQueriesScheme('https-intunemam');
  plist.addApplicationQueriesScheme('ms-outlook-intunemam');

  for (var scheme of plist.getApplicationQueriesSchemes()) {
    if (!isURLSchemeIntuneMAM(scheme) && scheme !== 'mailto') {
      plist.addApplicationQueriesScheme(scheme + '-intunemam');
    }
  }
};

// Sets the AppGroupIdentifier inside IntuneMAMSettings based on the app-group value inside the entitlements (if set).
// plist: the parsed plist JSON to add the group key to
// entitlements: the parsed entitlements object to get the group key from
var configureAppGroupKey = function (plist, entitlements) {
  console.log('Starting Step: Moving Application Group Identifiers');
  var appGroups = entitlements.getApplicationGroupsSet();
  if (appGroups) {
    plist.addToAppGroupIdentifiers(appGroups);
  }
};

// Checks if the given configuration contains an entitlements file, if not it creates it and adds it to the configuration and project.
// config: the configuration's guid
// project: the xcode project object
var createEntitlementsIfNone = function (config, project) {
  if (project.hasEntitlements(config)) {
    return;
  }
  var projectName = project.getProjectName();
  var entitlementsPath = projectName + '/Resources/' + projectName + '.entitlements';
  if (!fs.existsSync('./platforms/ios/' + projectName + '/Resources/')) {
    fs.mkdirSync('./platforms/ios/' + projectName + '/Resources/');
  }
  fs.writeFileSync('./platforms/ios/' + entitlementsPath, plist.build({}));
  project.setEntitlementsFileName(config, entitlementsPath);
  project.addResourceFile(projectName + '.entitlements');
};

// Iterates over the primary target's configurations and returns a list of all plist/entitlements files and a mapping between the relationship between entitlements and plists.
// project: the xcode project object
// returns: a dictionary in the form {'files': [String], 'entitlementsPlistMapping' : {String -> [String]}} where files is the list of entitlements AND plist filenames and
//  entitlementsPlistMapping maps entitlement filenames to a list of associated plist filenames.
var getEntitlementsAndPlistInfo = function (project) {
  var configUUIDList = project.getNativeTargetConfigList();
  var files = [];
  var mapping = {};
  for (var config of configUUIDList) {
    config = config['value'];

    var plistName = project.getPlistFileName(config);
    if (files.indexOf(plistName) < 0) {
      files.push(plistName);
    }

    createEntitlementsIfNone(config, project);

    var entitlementsName = project.getEntitlementsFileName(config);
    if (files.indexOf(entitlementsName) < 0) {
      files.push(entitlementsName);
    }

    if (Object.keys(mapping).indexOf(entitlementsName) < 0) {
      mapping[entitlementsName] = [];
    }
    if (mapping[entitlementsName].indexOf(plistName) < 0) {
      mapping[entitlementsName].push(plistName);
    }
  }

  return {'files': files, 'entitlementsPlistMapping': mapping};
};

// Loads all files and stores the filename / parsed plist data.
// files: an array contain the files to be loaded
var loadFiles = function (files) {
  return Q.all(files.map(function (name) {
    var plist = new PlistHelper(name, Q);
    return plist.load();
  }));
};

// Saves all plist files stored in the dictionary and passes a mapping of filenames to parsed objects to the next method in the Q promise chain.
// returns: a Q promise which will be resolved when we have saved all supplied files.
var saveFiles = function (files) {
  return Q.all(files.map(function (file) {
    return file.save();
  }));
};

// Grants execution access to the Intune MAM Configurator binary
// returns: a Q promise which will be resolved once the call completes
var chmodIntuneConfigurator = function () {
  return Q.nfcall(exec, 'chmod +x plugins/' + pluginCommon.getPluginId() + '/lib/ios/IntuneMAMConfigurator');
};

// Adds all of the Intune UTI configuration to the app's plist
// plistPath: The pbxproj
// returns: a Q promise which will be resolved once the call completes
var addIntuneUtis = function (project) {
  console.log('Starting Step: Adding Intune UTI\'s to plists');
  var configUUIDList = project.getNativeTargetConfigList();
  var plists = configUUIDList.map(function (config) {
    config = config['value'];
    return path.join(__dirname, '../../../../platforms/ios', project.getPlistFileName(config));
  }).filter(function (value, index, array) {
    return array.indexOf(value) === index;
  });

  return Q.all(plists.map(function (plist) {
    var pathToConfigurator = path.resolve(__dirname, '../../lib/ios/IntuneMAMConfigurator');
    return Q.nfcall(exec, '\"' + pathToConfigurator + '\" \"' + plist + '\"');
  }));
};

// Iterates through the list of all configurations associated with the primary native target of
// the supplied project and runs the configuration steps for each one.
// q: a reference to the Q npm library - via require('Q') or cordovaContext.requireCordovaModule('Q')
// project: a reference to the xcode project object (expects project.parse to have been already called)
// returns: a Q promise which will be resolved when we have completed all configuration steps and saved changes.
module.exports.configureIntuneMAM = function (q, project) {
  Q = q;

  // This mapping allows us to save the plists/entitlements since the parsed object does not maintain where the file came from.
  var fileInfo = getEntitlementsAndPlistInfo(project);

  return loadFiles(fileInfo.files)
    .then(function (files) {
      configureEntitlementsAndPlists(fileInfo.entitlementsPlistMapping, files);
      return saveFiles(files);
    })
    .then(chmodIntuneConfigurator)
    .then(function () {
      return addIntuneUtis(project);
    });
};

// SIG // Begin signature block
// SIG // MIIdpgYJKoZIhvcNAQcCoIIdlzCCHZMCAQExCzAJBgUr
// SIG // DgMCGgUAMGcGCisGAQQBgjcCAQSgWTBXMDIGCisGAQQB
// SIG // gjcCAR4wJAIBAQQQEODJBs441BGiowAQS9NQkAIBAAIB
// SIG // AAIBAAIBAAIBADAhMAkGBSsOAwIaBQAEFIK6bjSxFY9y
// SIG // YiKyLntC3Qa0tlXXoIIYZDCCBMMwggOroAMCAQICEzMA
// SIG // AADIRyKdow3KwFgAAAAAAMgwDQYJKoZIhvcNAQEFBQAw
// SIG // dzELMAkGA1UEBhMCVVMxEzARBgNVBAgTCldhc2hpbmd0
// SIG // b24xEDAOBgNVBAcTB1JlZG1vbmQxHjAcBgNVBAoTFU1p
// SIG // Y3Jvc29mdCBDb3Jwb3JhdGlvbjEhMB8GA1UEAxMYTWlj
// SIG // cm9zb2Z0IFRpbWUtU3RhbXAgUENBMB4XDTE2MDkwNzE3
// SIG // NTg1NFoXDTE4MDkwNzE3NTg1NFowgbMxCzAJBgNVBAYT
// SIG // AlVTMRMwEQYDVQQIEwpXYXNoaW5ndG9uMRAwDgYDVQQH
// SIG // EwdSZWRtb25kMR4wHAYDVQQKExVNaWNyb3NvZnQgQ29y
// SIG // cG9yYXRpb24xDTALBgNVBAsTBE1PUFIxJzAlBgNVBAsT
// SIG // Hm5DaXBoZXIgRFNFIEVTTjo5OEZELUM2MUUtRTY0MTEl
// SIG // MCMGA1UEAxMcTWljcm9zb2Z0IFRpbWUtU3RhbXAgU2Vy
// SIG // dmljZTCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoC
// SIG // ggEBAKFDTcpJ4SHEMleKEDuPnLvcHXi3OtuHvVtG8Ag5
// SIG // x6XcSarRBpL+3/tJGKcmJPK6Xwnvh9mgrgORdF6BVi0p
// SIG // DrGoxNZ/zEVQB9uLJS2D8mf1zu1oDBr20kTi/e3sEkWS
// SIG // BJBZtnQgdQ0Qznn+2VcOgzIa5eYfLNvfXg8RMoca2OIt
// SIG // L0GSisAw9/MZTF3YXNlCRgNBmdegciTBkMwarLkcr8QB
// SIG // qyzUuZowqaIBLSSuQgpuwujvOGVklTfDnvsOv4oCm6vb
// SIG // xCfIvEOFaIQHED9FaVvmIN6pqBjAr2+A1UUkDHibK3s6
// SIG // GO2zSY6YnFXqPetr0Mn9PW90kxfnKqY+gF8xlVcCAwEA
// SIG // AaOCAQkwggEFMB0GA1UdDgQWBBQP4WX92I3DlqYo8NLf
// SIG // no09qn1ezDAfBgNVHSMEGDAWgBQjNPjZUkZwCu1A+3b7
// SIG // syuwwzWzDzBUBgNVHR8ETTBLMEmgR6BFhkNodHRwOi8v
// SIG // Y3JsLm1pY3Jvc29mdC5jb20vcGtpL2NybC9wcm9kdWN0
// SIG // cy9NaWNyb3NvZnRUaW1lU3RhbXBQQ0EuY3JsMFgGCCsG
// SIG // AQUFBwEBBEwwSjBIBggrBgEFBQcwAoY8aHR0cDovL3d3
// SIG // dy5taWNyb3NvZnQuY29tL3BraS9jZXJ0cy9NaWNyb3Nv
// SIG // ZnRUaW1lU3RhbXBQQ0EuY3J0MBMGA1UdJQQMMAoGCCsG
// SIG // AQUFBwMIMA0GCSqGSIb3DQEBBQUAA4IBAQCalA8osgfe
// SIG // 4wPVPb6exzqvC8wiH2FbUHyYuT1Mya6cM7+ge2qEwvog
// SIG // q/EHYjBuxmsnfHlqwtAcZispUzv5Uqz2dP9xGX+G81RG
// SIG // lHwLQoZODo7+4igj6yNEQYGdPrUD2Bk44qnbkKNruMZt
// SIG // BmzfUSkYjTW9SAmnSdYZH9rswT4+yFS7YVeRan6vSprY
// SIG // 1g3qnstkAQgBvTMQKjKOhKXtCA28FVG0htj8zPqy0ie7
// SIG // PKfv68Qmzxi4sVpQLbmNqhZ9Nf9n17UmsYUuLzc6RYTv
// SIG // 8//puXx5v4//PMs0b0H1qbZUJUkXb8Du9lXPjW769vZz
// SIG // TcOuthsQ2xw7hjd0uua4z7AJMIIGBzCCA++gAwIBAgIK
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
// SIG // hvcNAQkEMRYEFAUsj/zXkkP3zA7uBUXE3WW22ihVMGIG
// SIG // CisGAQQBgjcCAQwxVDBSoDSAMgBNAGkAYwByAG8AcwBv
// SIG // AGYAdAAgAEMAbwByAHAAbwByAGEAdABpAG8AbgAgACgA
// SIG // UgApoRqAGGh0dHA6Ly93d3cubWljcm9zb2Z0LmNvbTAN
// SIG // BgkqhkiG9w0BAQEFAASCAQA1NMsM52y5RkeRnPX9j53q
// SIG // VA2keZwIpYRym3xybw+HWbqOu05MADdq3crinx8nrWDG
// SIG // rdkfzXTWMKeXrAv3ueFssuiwBdMu8pWrZPHMF+HPBBOw
// SIG // ZXfKJN/DzFsxC71iPlokw5BPcimzC6VazDYSb9HODYGH
// SIG // ftB3UyvoHg96j5XWC9BEoKfIemJN5yWb+hsOGAtt2PCv
// SIG // X1W95yKI9sEgleCOZp1mS0HGz3JnU4mzxOuIr+THsniN
// SIG // ggu4wJj0v5dpyhOj1BYzWSAw4vJlL3B/dJb2N0+nNTP2
// SIG // zZA6N6APVQu5tmTQWNRFZCXQXw6MwiOwwxr59iocAziC
// SIG // mnUReDfUtkzWoYICKDCCAiQGCSqGSIb3DQEJBjGCAhUw
// SIG // ggIRAgEBMIGOMHcxCzAJBgNVBAYTAlVTMRMwEQYDVQQI
// SIG // EwpXYXNoaW5ndG9uMRAwDgYDVQQHEwdSZWRtb25kMR4w
// SIG // HAYDVQQKExVNaWNyb3NvZnQgQ29ycG9yYXRpb24xITAf
// SIG // BgNVBAMTGE1pY3Jvc29mdCBUaW1lLVN0YW1wIFBDQQIT
// SIG // MwAAAMhHIp2jDcrAWAAAAAAAyDAJBgUrDgMCGgUAoF0w
// SIG // GAYJKoZIhvcNAQkDMQsGCSqGSIb3DQEHATAcBgkqhkiG
// SIG // 9w0BCQUxDxcNMTYxMDMxMTg0MjUwWjAjBgkqhkiG9w0B
// SIG // CQQxFgQUj8LNG5qrdpsSzFi0DBuC62UjhOIwDQYJKoZI
// SIG // hvcNAQEFBQAEggEAKaORNUs06+jtHAx4RgL5V1maOp3I
// SIG // 9MI72nrkY3DsBxSa+Fd4jj3hTFpx1tkbxCbAO0OwGzHm
// SIG // +QXGOXZYX7rJose9seIs5qwJEVKur/+of3FbssSF56XN
// SIG // Pn9EL6ywdsOJ9cIp3XVUABuT6/Wjqe+Z4tLNr+G/oBaC
// SIG // iBa/GU+S5a+R/FkZdHSJCCrqsOwatIG2lC8gRVmfnO7w
// SIG // CamBXgPN7e0pAo/EQQnCm3zfzTk2ZNH0pIhuXlzmiGOM
// SIG // pmAxZitVsQph1+myTDwd6zbnFVousDpmORdnutkIhN47
// SIG // 2+bq3bdigj3i4I0lA3QgL5k6BOumJ5/9mNDUjHCe4Gd+
// SIG // pPAmoA==
// SIG // End signature block
