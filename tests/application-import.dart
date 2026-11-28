// Optional real application integration. Run via npm run test:import.
// Preferences, provider storage and the HTTP subscription are isolated fixtures.
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:baka_music/rust/bridge.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:path_provider_platform_interface/path_provider_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  test('template imports by URL/subscription, configures and resolves without user state', () async {
    final root = Platform.environment['BAKA_AUTHORING_ROOT']!;
    final source = await File('$root/assets/authoring/direct-url-provider.js')
        .readAsString();
    final storage = await Directory.systemTemp.createTemp(
      'baka-authoring-app-',
    );
    final previous = PathProviderPlatform.instance;
    PathProviderPlatform.instance = _Paths(storage.path);
    // The runner stages this test under .dart_tool rather than test/ so it
    // never changes the application test suite. This is test-only isolation.
    // ignore: invalid_use_of_visible_for_testing_member
    SharedPreferences.setMockInitialValues({});
    final audio = _silentWav();
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      if (request.uri.path == '/subscription.json') {
        request.response.headers.contentType = ContentType.json;
        request.response.write(
          jsonEncode({
            'plugins': [
              {'url': './provider.js'},
            ],
          }),
        );
      } else if (request.uri.path == '/provider.js') {
        request.response.headers.contentType = ContentType(
          'application',
          'javascript',
        );
        request.response.write(source);
      } else if (request.uri.path == '/authorized-audio.wav') {
        final response = request.response;
        response.headers.contentType = ContentType('audio', 'wav');
        response.headers.set(HttpHeaders.acceptRangesHeader, 'bytes');
        final range = request.headers.value(HttpHeaders.rangeHeader);
        final match = range == null
            ? null
            : RegExp(r'^bytes=(\d+)-(\d*)$').firstMatch(range);
        final start = match == null ? 0 : int.parse(match[1]!);
        final end = match == null || match[2]!.isEmpty
            ? audio.length - 1
            : int.parse(match[2]!).clamp(0, audio.length - 1);
        if (start >= audio.length || start > end) {
          response.statusCode = HttpStatus.requestedRangeNotSatisfiable;
          response.headers.set(
            HttpHeaders.contentRangeHeader,
            'bytes */${audio.length}',
          );
        } else {
          if (match != null) {
            response.statusCode = HttpStatus.partialContent;
            response.headers.set(
              HttpHeaders.contentRangeHeader,
              'bytes $start-$end/${audio.length}',
            );
          }
          response.contentLength = end - start + 1;
          if (request.method != 'HEAD') {
            response.add(audio.sublist(start, end + 1));
          }
        }
      } else {
        request.response.statusCode = HttpStatus.notFound;
      }
      await request.response.close();
    });
    final base = 'http://127.0.0.1:${server.port}';
    final bridge = await RustBridge.ensure({});
    const id = 'org.example.direct-audio';
    try {
      final result = await bridge.reloadPluginsFromUrls([
        '$base/subscription.json',
      ]);
      expect(result.failures, isEmpty);
      expect(bridge.pluginCatalog.single.id, id);
      expect(
        bridge.pluginCatalog.single.manifest['sourceId'],
        'direct-audio.v1',
      );
      await bridge.setPluginVariables(id, {
        'audioUrl': '$base/authorized-audio.wav',
        'trackId': 'app-fixture',
        'title': 'Application fixture',
        'artist': 'Fixture author',
      });
      final (tracks, cursor) = await bridge.search(id, 'fixture', null);
      expect(tracks.single.id, 'app-fixture');
      expect(tracks.single.title, 'Application fixture');
      expect(cursor, isNull);
      final resolved = await bridge.callProviderCapability(
        id,
        'media.resolve',
        {
          'entity': {'id': tracks.single.id},
          'quality': 'original',
        },
      ) as Map;
      expect(resolved['url'], '$base/authorized-audio.wav');
      expect(resolved['quality'], 'original');
      final playback = await bridge.resolvePlayback(
        tracks.single,
        preferred: 'master',
        fallback: false,
      );
      expect(playback['requestedQuality'], 'master');
      expect(playback['quality'], 'original');
      expect((playback['source'] as Map)['url'], isNotEmpty);
      final playbackSource = playback['source'] as Map;
      // Flutter's widget-test override intentionally returns HTTP 400. This
      // dedicated client uses the real transport only for our loopback fixture.
      final client = _FixtureHttp().createHttpClient(null)
        ..findProxy = (_) => 'DIRECT';
      try {
        final request = await client.getUrl(
          Uri.parse(playbackSource['url'] as String),
        );
        final headers = playbackSource['headers'];
        if (headers is Map) {
          headers.forEach(
            (key, value) => request.headers.set(key as String, value),
          );
        }
        request.headers.set(HttpHeaders.rangeHeader, 'bytes=0-43');
        final response = await request.close();
        expect(response.statusCode, HttpStatus.partialContent);
        final bytes = await response.fold<List<int>>(
          [],
          (all, part) => all..addAll(part),
        );
        expect(bytes.length, 44);
        expect(ascii.decode(bytes.sublist(0, 4)), 'RIFF');
      } finally {
        client.close(force: true);
      }
      final defaultSource = await bridge.getMediaSource(tracks.single);
      expect(defaultSource.url, '$base/authorized-audio.wav');
      // This verifies native playback source preparation, not device decoding.
      final direct = await bridge.reloadPluginsFromUrls(['$base/provider.js']);
      expect(direct.failures, isEmpty);
      expect(bridge.pluginCatalog.single.id, id);
      final (afterReload, _) = await bridge.search(id, 'fixture', null);
      expect(afterReload.single.id, 'app-fixture');
      expect(afterReload.single.title, 'Application fixture');
      const invalid =
          "// @baka-provider 2\n"
          "module.exports={manifest:{apiVersion:2,kind:'provider',id:'example.bad-flat',sourceId:'cit.v1',name:'Bad fixture',author:'Fixture',version:'1.0.0',capabilities:['entities.get']},handlers:{'entities.get':()=>null}};";
      await expectLater(
        bridge.importPlugin('bad.js', invalid),
        throwsA(isA<RustBridgeException>()),
      );
      expect(bridge.pluginCatalog.single.id, id);
    } finally {
      await bridge.removePlugin(id);
      await server.close(force: true);
      PathProviderPlatform.instance = previous;
      await storage.delete(recursive: true);
    }
  }, timeout: const Timeout(Duration(minutes: 2)));
}

Uint8List _silentWav() {
  const sampleRate = 44100;
  const dataLength = sampleRate * 2;
  final bytes = Uint8List(44 + dataLength);
  final header = ByteData.sublistView(bytes);
  void tag(int offset, String value) =>
      bytes.setRange(offset, offset + value.length, value.codeUnits);
  tag(0, 'RIFF');
  header.setUint32(4, bytes.length - 8, Endian.little);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  header.setUint32(16, 16, Endian.little);
  header.setUint16(20, 1, Endian.little); // PCM
  header.setUint16(22, 1, Endian.little); // mono
  header.setUint32(24, sampleRate, Endian.little);
  header.setUint32(28, sampleRate * 2, Endian.little);
  header.setUint16(32, 2, Endian.little);
  header.setUint16(34, 16, Endian.little);
  tag(36, 'data');
  header.setUint32(40, dataLength, Endian.little);
  return bytes;
}

class _Paths extends PathProviderPlatform {
  _Paths(this.root);
  final String root;
  @override
  Future<String?> getApplicationSupportPath() async => root;
}

class _FixtureHttp extends HttpOverrides {}
