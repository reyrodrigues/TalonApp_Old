angular.module('talon.controllers', [])
.controller('AppCtrl', function($rootScope, $scope, $ionicModal) {
    $ionicModal.fromTemplateUrl('templates/login.html', {
        scope: $scope,
        animation: 'slide-in-up'
    }).then(function(modal) {
        $scope.modal = modal;
    });
    $rootScope.$on('app:signedOut', function() {
        $scope.modal.show();
    });
    $rootScope.$on('app:authenticated', function() {
        $scope.modal.hide();
    });


})
.controller('DashCtrl', function($rootScope, $localStorage, $scope, $q, DashboardService) {
    $scope.voucher = {
    };
    $scope.reload = function() {
        return DashboardService.restore().then(function(response){
           $localStorage.Vouchers = ($localStorage.Vouchers||[]).concat(response.data);
           $scope.Vouchers = $localStorage.Vouchers;
        })
        .finally(function() {
            // Stop the ion-refresher from spinning
            $scope.$broadcast('scroll.refreshComplete');
        });
    };

    var findVoucher = function(voucher, id) {
        var md = forge.md.md5.create();
        md.update(forge.util.encodeUtf8(id + ':' + voucher))
        var digest = md.digest()
        var key = forge.util.encode64(digest.data)

        return $localStorage.Vouchers.filter(function(v){
            return v.Key == key;
        });
    };

    var decryptRecord = function(record, id, pin) {
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
        } catch(e) {
            return "";
        }
    };


    $scope.validateVoucher = function(code, id, pin){
        var decrypted = findVoucher(code, id).map(function(m) {
            return decryptRecord(m, id, pin);
        });

        return decrypted.filter(function(d) {
            return d.split(':')[0] == code;
        }).length  > 0;
    };

    $scope.scan = function() {
        if(cordova) {
            cordova.plugins.barcodeScanner.scan(
              function (result) {
                  $scope.$apply(function(){
                        if(!result.cancelled)
                            $scope.voucher.Code = result.text;
                  });
              },
              function (error) {
              }
           );
        }
    }

    $rootScope.$on('app:authenticated', function(){ $scope.reload(); });
    $rootScope.$on('app:dataCleared', function(){ $scope.Vouchers = []; });

    $q.when($scope.reload());
})

.controller('ChatsCtrl', function($scope, Chats) {
  $scope.chats = Chats.all();
  $scope.remove = function(chat) {
    Chats.remove(chat);
  }
})

.controller('ChatDetailCtrl', function($scope, $stateParams, Chats) {
  $scope.chat = Chats.get($stateParams.chatId);
})

.controller('AccountCtrl', function($scope, $rootScope, $localStorage) {
  $scope.reset = function() {
    delete $localStorage.BeginPeriod;
    delete $localStorage.Vouchers;

    $rootScope.$emit('app:dataCleared');
  };
  $scope.logOut = function() {
     $localStorage.$reset();
     $rootScope.$emit('app:signedOut');
  };
  $scope.settings = {
    enableFriends: true
  };
})

.controller('LoginCtrl', function($scope, $http, $state, authService, $localStorage, $rootScope) {
    $scope.loading = false;
    $scope.user = {};
    $scope.authError = null;

    if($localStorage.authorizationData) {
        $scope.loading = true;

        authService.loadUserData().then(function () {
            $rootScope.$emit('app:authenticated');
            $state.go('tab.dash');
        })
        .catch(function(){
            $scope.loading = false;
        });
    }

    $scope.login = function () {
        $scope.authError = null;
        $scope.loading = true;

        authService.login({
            'userName': $scope.user.userName,
            'password': $scope.user.password
        }).then(function (response) {
            authService.loadUserData().then(function () {
                $rootScope.$emit('app:authenticated');
                $state.go('tab.dash');
            });
        }, function (error) {
            $scope.loading = false;
            $scope.authError = error.error_description;
        });
    };
});
