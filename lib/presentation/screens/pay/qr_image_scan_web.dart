import 'dart:async';

// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

import 'dart:js_interop';
import 'dart:js_interop_unsafe';

import 'package:image_picker/image_picker.dart';

/// Decode a QR from a gallery photo with jsQR (same path as live web scan).
Future<String?> decodeQrFromGallery(XFile file) async {
  String? url;
  var ownsUrl = false;
  try {
    final path = file.path.trim();
    if (path.startsWith('blob:') || path.startsWith('data:')) {
      url = path;
    } else if (path.startsWith('http://') || path.startsWith('https://')) {
      url = path;
    } else {
      final bytes = await file.readAsBytes();
      if (bytes.isEmpty) return null;
      final blob = html.Blob([bytes]);
      url = html.Url.createObjectUrlFromBlob(blob);
      ownsUrl = true;
    }

    final imageUrl = url;
    final completer = Completer<String?>();
    globalContext.callMethod(
      'zepDecodeImageUrlCb'.toJS,
      imageUrl.toJS,
      ((JSAny? result) {
        if (ownsUrl) {
          html.Url.revokeObjectUrl(imageUrl);
        }
        if (completer.isCompleted) return;
        if (result == null) {
          completer.complete(null);
          return;
        }
        final data = (result as JSObject)
            .getProperty<JSString?>('data'.toJS)
            ?.toDart;
        completer.complete(data);
      }).toJS,
    );
    return completer.future.timeout(const Duration(seconds: 15));
  } catch (_) {
    if (ownsUrl && url != null) {
      html.Url.revokeObjectUrl(url);
    }
    return null;
  }
}
