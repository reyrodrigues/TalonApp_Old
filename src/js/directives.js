angular.module('talon.directives', [])

    .directive('noScroll', function () {

        return {
            restrict: 'A',
            link: function ($scope, $element, $attr) {

                $element.on('touchmove', function (e) {
                    e.preventDefault();
                });

                $('input', $element).on('focus', function (e) {
                    e.preventDefault();
                    e.stopPropagation();
                    //window.scrollTo(0,0); //the second 0 marks the Y scroll pos. Setting this to i.e. 100 will push the screen up by 100px.
                });
            }
        }
    })


;
