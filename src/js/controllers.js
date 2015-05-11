/* global cordova, bluetoothSerial  */

angular.module('talon.controllers', [])
    .controller('AppCtrl',
    function ($rootScope, $scope, $ionicModal, $state, $cordovaDevice, $cordovaNetwork, $ionicPlatform, $localStorage) {
        $rootScope.isAdmin = $localStorage.authorizationData && $localStorage.authorizationData.isAdmin;

        $rootScope.$on('app:signedOut', function () {
            $state.go('login');
        });
        $rootScope.$on('app:authenticated', function () {
        });


        $rootScope.$on('$stateChangeStart', function (event, toState, toParams, fromState, fromParams) {
            if (toState.name != 'login' && !$localStorage.authorizationData) {
                event.preventDefault();
                $state.go('login');
            }
        });


        $ionicPlatform.ready(function () {
            if (window.nfc) {
                var nfcHandler = function (nfcEvent) {
                    $rootScope.$apply(function () {
                        $rootScope.$emit('nfc:tag', nfcEvent.tag);
                    });
                };
                nfc.addTagDiscoveredListener(nfcHandler);
                nfc.addNdefListener(nfcHandler);
            }

            $rootScope.device = $cordovaDevice.getDevice();
            $rootScope.isOnline = $cordovaNetwork.isOnline();

            $rootScope.$on('$cordovaNetwork:online', function (event, networkState) {
                $rootScope.isOnline = true;
            })

            $rootScope.$on('$cordovaNetwork:offline', function (event, networkState) {
                $rootScope.isOnline = false;
            })
        });

    })

    .controller('AccountCtrl',
    function ($scope, $rootScope, $localStorage) {
        $scope.logOut = function () {
            $localStorage.$reset();
            $rootScope.$emit('app:signedOut');
        };
    })

    .controller('LoginCtrl',
    function ($scope, $http, $state, $localStorage, $rootScope, $cordovaProgress, $cordovaDialogs, $ionicPlatform, $ionicHistory, adminAuthService, vendorAuthService) {
        $scope.loading = false;
        $scope.user = {};
        $scope.authError = null;
        $rootScope.isAdmin = false;

        $ionicPlatform.ready(function () {
            $ionicHistory.clearHistory();
            $ionicHistory.clearCache();
        });

        $scope.loginAsAdmin = function () {
            $rootScope.isAdmin = true;
        }
        $scope.loginAsVendor = function () {
            $rootScope.isAdmin = false;
        }

        if ($localStorage.authorizationData) {
            $scope.loading = true;

            $rootScope.$emit('app:authenticated');
            $state.go('tab.dash');
        }
        $scope.login = function () {
            vendorAuthService.login($scope.user.userName, $scope.user.password)
                .then(function () {
                    $rootScope.$emit('app:authenticated');
                    $state.go('tab.dash');

                    $ionicPlatform.ready(function () {
                        $cordovaProgress.hide();
                    });
                }).catch(function (response) {
                    $cordovaDialogs.alert('Invalid user name or password.', '');
                });
        }

        $scope.loginAdmin = function () {
            $scope.authError = null;
            $scope.loading = true;

            adminAuthService.login({
                'userName': $scope.user.userName,
                'password': $scope.user.password
            }).then(function (response) {
                adminAuthService.loadUserData().then(function () {
                    $rootScope.$emit('app:authenticated');

                    $state.go('tab.dash');
                });
            }, function (error) {
                console.log(error);

                $scope.loading = false;
                $scope.authError = error.error_description;
            });
        };
    })


    .controller('DashCtrl',
    function ($rootScope, $localStorage, $scope, $cordovaProgress, $ionicHistory, $q, $ionicPlatform, DashboardService, $cordovaActionSheet, $state, BeneficiaryService) {
        $ionicPlatform.ready(function () {
            $ionicHistory.clearHistory();
            $ionicHistory.clearCache();
        });

        $rootScope.$on('app:authenticated', function () {
            $scope.reload();
        });
        $rootScope.$on('app:dataCleared', function () {
            $scope.Vouchers = [];
        });

        $scope.status = "";

        var getOptions = function () {
            return {
                title: 'NFC Card Detected',
                buttonLabels: ['Claim Vouchers'].concat(($rootScope.isAdmin ? ['Provision Card'] : [])),
                addCancelButtonWithLabel: 'Cancel',
                androidEnableCancelButton: true,
                winphoneEnableCancelButton: true
            };
        }
        var findVoucher = function (voucher, id) {
            var md = forge.md.md5.create();
            md.update(forge.util.encodeUtf8(id + ':' + voucher))
            var digest = md.digest()
            var key = forge.util.encode64(digest.data)

            return $localStorage.Vouchers.filter(function (v) {
                return v.Key == key;
            });
        };
        var decryptRecord = function (record, id, pin) {
            try {
                var pad = "00000000";
                var salt = forge.util.encodeUtf8(pad.substring(0, pad.length - id.length) + id);
                var key = forge.pkcs5.pbkdf2(pin, salt, 1000, 16);
                var iv = forge.util.createBuffer(forge.util.decode64(record.IV), 'raw');
                var encrypted = forge.util.createBuffer(forge.util.decode64(record.Encrypted));
                var decipher = forge.cipher.createDecipher('AES-CBC', key);

                decipher.start({iv: iv});
                decipher.update(encrypted);
                decipher.finish();

                // outputs decrypted hex
                return decipher.output.toString();
            } catch (e) {
                return "";
            }
        };

        $scope.validateVoucher = function (code, id, pin) {
            var decrypted = findVoucher(code, id).map(function (m) {
                return decryptRecord(m, id, pin);
            });

            return decrypted.filter(function (d) {
                return d.split(':')[0] == code;
            }).length > 0;
        };
        $scope.scan = function () {
            if (cordova) {
                cordova.plugins.barcodeScanner.scan(
                    function (result) {
                        $scope.$apply(function () {
                            if (!result.cancelled)
                                $scope.voucher.Code = result.text;
                        });
                    },
                    function (error) {
                    }
                );
            }
        }
        $scope.syncFromDevice = function () {
            DashboardService.syncFromDevice().then(function (data) {
            })
        };
        $scope.syncFromServer = function () {
            $scope.status = "Downloading data from server.";
            return DashboardService.syncFromServer().then(function (data) {
                $ionicPlatform.ready(function () {
                    $scope.status = "Download complete.";
                });
            })
        };
        $scope.refreshDashboard = function () {
            $scope.syncFromServer()
                .finally(function () {
                    // Stop the ion-refresher from spinning
                    $scope.$broadcast('scroll.refreshComplete');
                });
        };

        $scope.eventHandler = function () {
        };
        $scope.refillCard = function () {
            window.plugins.spinnerDialog.show(null, "Tap Card Now", function () {
                $state.go('tab.dash');
            });

            $scope.eventHandler();
            $scope.eventHandler = $rootScope.$on('nfc:tag', function (event, tag) {
                if ($state.is('tab.dash')) {
                    var card = {
                        Id: nfc.bytesToHexString(tag.id),
                        Messages: (tag.ndefMessage || []).map(function (m) {
                            return {
                                Id: nfc.bytesToHexString(m.id),
                                Type: nfc.bytesToString(m.type),
                                Message: nfc.bytesToString(m.payload)
                            }
                        })
                    };

                    var records = card.Messages.filter(function (m) {
                        return m.Type == 'application/x-talon-id';
                    });
                    if (records.length > 0) {
                        var record = records[0];
                        console.log("Loading " + record.Message);
                        BeneficiaryService.loadVouchers(record.Message).then(function (load) {
                            var toWrite = [
                                ndef.mimeMediaRecord('application/x-talon-id', nfc.stringToBytes(record.Message)),
                                ndef.mimeMediaRecord('application/x-talon-codes', load.join(':'))
                            ];

                            nfc.write(toWrite, function () {
                                window.plugins.spinnerDialog.hide();
                                alert('Card loaded successfully');
                                isProvisioning = false;
                            }, function () {
                                window.plugins.spinnerDialog.hide();
                                isProvisioning = false;
                            });
                        })
                            .finally(function () {
                                window.plugins.spinnerDialog.hide();
                            })
                    } else {
                        window.plugins.spinnerDialog.hide();
                    }
                }
            });
        }

    })
    .controller('ClaimCtrl',
    function ($scope, $rootScope, $state, $ionicPlatform, VoucherService) {
        $ionicPlatform.ready(function () {
            window.plugins.spinnerDialog.show(null, "Tap Card Now", function () {
                $state.go('tab.dash');
            });
            var isReading = true;
            var eventHandler = $rootScope.$on('nfc:tag', function (event, tag) {
                if ($state.is('claim') && isReading) {
                    var card = {
                        Id: nfc.bytesToHexString(tag.id),
                        Messages: (tag.ndefMessage || []).map(function (m) {
                            return {
                                Id: nfc.bytesToHexString(m.id),
                                Type: nfc.bytesToString(m.type),
                                Message: nfc.bytesToString(m.payload)
                            }
                        })
                    };

                    var types = card.Messages.map(function (m) {
                        return m.Type;
                    });

                    if (types.indexOf('application/x-talon-id') != -1 && types.indexOf('application/x-talon-codes') != -1) {
                        var id = card.Messages.filter(function (m) {
                            return m.Type == 'application/x-talon-id';
                        }).pop();
                        var vouchers = card.Messages.filter(function (m) {
                            return m.Type == 'application/x-talon-codes';
                        }).pop();

                        $scope.nationalId = id.Message;
                        $scope.codes = vouchers.Message.split(':');

                        VoucherService.listInformation($scope.codes, $scope.nationalId)
                            .then(function (codes) {
                                console.log(codes.map(function (c) {
                                    return JSON.stringify(c, null, 4);
                                }));
                            });
                    }
                    window.plugins.spinnerDialog.hide();

                    eventHandler();
                }
            });
        });
    })


    .controller('ProvisionCtrl',
    function ($scope, $rootScope, $state, $ionicPlatform, BeneficiaryService) {
        $scope.model = {};
        var isProvisioning = false;
        $scope.loadBeneficiary = function () {
            BeneficiaryService.loadBeneficiary($scope.model.BeneficiaryId)
                .then(function (beneficiary) {
                    $scope.beneficiary = beneficiary;
                })
                .catch(function (error) {
                    alert(error.Message);
                });
        };
        $scope.provision = function () {
            isProvisioning = true;

            window.plugins.spinnerDialog.show(null, "Tap Card Now", function () {
                $state.go('tab.dash');
            });
        };
        $ionicPlatform.ready(function () {
            window.plugins.spinnerDialog.show(null, "Tap Card Now", function () {
                $state.go('tab.dash');
            });
            $rootScope.$on('nfc:tag', function (event, tag) {
                if ($state.is('provision')) {
                    $scope.tag = tag;
                    if (!isProvisioning) {
                        $scope.card = {
                            Id: nfc.bytesToHexString(tag.id),
                            Messages: (tag.ndefMessage || []).map(function (m) {
                                return {
                                    Id: nfc.bytesToHexString(m.id),
                                    Type: nfc.bytesToString(m.type),
                                    Message: nfc.bytesToString(m.payload)
                                }
                            })
                        };
                        window.plugins.spinnerDialog.hide();
                    } else {
                        var records = [
                            ndef.mimeMediaRecord('application/x-talon-id', nfc.stringToBytes($scope.beneficiary.NationalId))
                        ];

                        nfc.write(records, function () {
                            window.plugins.spinnerDialog.hide();

                            alert('Card provisioned successfully');
                            $state.go('tab.dash')
                        }, function () {
                        });
                        isProvisioning = false;
                    }
                }
            });
        });
    })


;


