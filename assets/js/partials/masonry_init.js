
try {
  var elem = document.querySelector('.grid');
  var msnry = new Masonry(elem, {
    itemSelector: '.grid-item',
    columnWidth: '.grid-sizer',
    gutter: '.gutter-sizer',
    percentPosition: true
  });

  var imgLoad = imagesLoaded(elem);
  imgLoad.on('progress', function (instance, image) {
    msnry.layout();
  });
} catch (err) {
  if (err instanceof ReferenceError) {
  } else {
    throw err;
  }
}
