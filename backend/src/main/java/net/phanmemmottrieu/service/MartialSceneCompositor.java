package net.phanmemmottrieu.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.AlphaComposite;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.FontMetrics;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.geom.Ellipse2D;
import java.awt.image.BufferedImage;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Random;

/**
 * Java2D compositor — rooftop neon, rain, silhouette, face plate từ cutout user.
 */
@Component
public class MartialSceneCompositor {

    @Value("${ai.media.render.output-width:1080}")
    private int outputWidth;

    @Value("${ai.media.render.output-height:1920}")
    private int outputHeight;

    public int canvasWidth() {
        return Math.max(720, outputWidth);
    }

    public int canvasHeight() {
        return Math.max(1280, outputHeight);
    }

    public BufferedImage composeScene(
        String sceneId,
        Path cutoutPath,
        String caption,
        int sceneIndex,
        int frameIndex,
        int frameCount
    ) throws Exception {
        int w = canvasWidth();
        int h = canvasHeight();
        BufferedImage canvas = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = canvas.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);

        int seed = sceneIndex * 1000 + frameIndex * 17;
        paintRooftopNeon(g, w, h, sceneIndex, seed);
        paintRain(g, w, h, seed + frameIndex * 31);

        BufferedImage cutout = cutoutPath != null ? ImageIO.read(cutoutPath.toFile()) : null;
        String id = String.valueOf(sceneId == null ? "" : sceneId).toLowerCase(Locale.ROOT);

        switch (id) {
            case "hero_reveal" -> drawHeroReveal(g, w, h, cutout);
            case "dodge" -> {
                drawEnemySilhouettes(g, w, h, 2, 0.72);
                drawCharacterPose(g, w, h, cutout, "dodge", "left", 0.88);
            }
            case "combo" -> drawComboFrame(g, w, h, cutout, frameIndex, Math.max(1, frameCount));
            case "hero_finale" -> drawHeroFinale(g, w, h, cutout);
            default -> drawCharacterPose(g, w, h, cutout, "idle", "center", 0.92);
        }

        paintVignette(g, w, h);
        drawCaption(g, w, h, caption, sceneIndex);
        g.dispose();
        return canvas;
    }

    public BufferedImage extractFacePlate(BufferedImage cutout) {
        if (cutout == null) return null;
        int minX = cutout.getWidth();
        int minY = cutout.getHeight();
        int maxX = 0;
        int maxY = 0;
        for (int y = 0; y < cutout.getHeight(); y++) {
            for (int x = 0; x < cutout.getWidth(); x++) {
                int alpha = (cutout.getRGB(x, y) >> 24) & 0xff;
                if (alpha > 40) {
                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x);
                    maxY = Math.max(maxY, y);
                }
            }
        }
        if (maxX <= minX || maxY <= minY) return null;
        int bw = maxX - minX + 1;
        int bh = maxY - minY + 1;
        int faceH = Math.max(32, (int) (bh * 0.48));
        int fx = minX;
        int fy = minY;
        int fw = bw;
        int fh = Math.min(faceH, bh);
        try {
            return cutout.getSubimage(fx, fy, fw, fh);
        } catch (Exception ex) {
            return cutout;
        }
    }

    private void paintRooftopNeon(Graphics2D g, int w, int h, int sceneIndex, int seed) {
        Random rnd = new Random(seed);
        Color top = new Color(8, 12, 28);
        Color mid = new Color(18, 10, 42);
        Color bottom = new Color(4, 6, 14);
        g.setPaint(new GradientPaint(0, 0, top, 0, h * 0.55f, mid));
        g.fillRect(0, 0, w, (int) (h * 0.55));
        g.setPaint(new GradientPaint(0, h * 0.45f, mid, 0, h, bottom));
        g.fillRect(0, (int) (h * 0.45), w, (int) (h * 0.55));

        // City bokeh
        for (int i = 0; i < 48; i++) {
            int cx = rnd.nextInt(w);
            int cy = (int) (h * 0.08 + rnd.nextDouble() * h * 0.42);
            int r = 4 + rnd.nextInt(18);
            int alpha = 18 + rnd.nextInt(55);
            Color c = i % 3 == 0 ? new Color(0, 255, 255, alpha)
                : i % 3 == 1 ? new Color(255, 0, 180, alpha)
                : new Color(255, 220, 80, alpha);
            g.setColor(c);
            g.fill(new Ellipse2D.Double(cx - r, cy - r, r * 2.0, r * 2.0));
        }

        // Rooftop floor
        int floorY = (int) (h * 0.78);
        g.setPaint(new GradientPaint(0, floorY, new Color(12, 16, 28), 0, h, new Color(2, 4, 8)));
        g.fillRect(0, floorY, w, h - floorY);
        g.setColor(new Color(255, 255, 255, 12));
        g.setStroke(new BasicStroke(2f));
        g.drawLine(0, floorY, w, floorY);

        // Neon lines
        g.setStroke(new BasicStroke(3f));
        g.setColor(new Color(0, 255, 255, 90));
        g.drawLine((int) (w * 0.05), floorY - 40, (int) (w * 0.95), floorY - 120 - sceneIndex * 8);
        g.setColor(new Color(255, 0, 160, 70));
        g.drawLine((int) (w * 0.1), floorY - 20, (int) (w * 0.88), floorY - 80);
    }

    private void paintRain(Graphics2D g, int w, int h, int seed) {
        Random rnd = new Random(seed);
        g.setStroke(new BasicStroke(1.2f));
        for (int i = 0; i < 120; i++) {
            int x = rnd.nextInt(w);
            int y = rnd.nextInt(h);
            int len = 12 + rnd.nextInt(28);
            g.setColor(new Color(180, 210, 255, 35 + rnd.nextInt(45)));
            g.drawLine(x, y, x - 3, y + len);
        }
    }

    private void drawHeroReveal(Graphics2D g, int w, int h, BufferedImage cutout) {
        drawCharacterPose(g, w, h, cutout, "back", "center", 0.95);
        // Rim light streak
        g.setPaint(new GradientPaint(0, (int) (h * 0.2), new Color(0, 255, 255, 0),
            0, (int) (h * 0.65), new Color(0, 255, 255, 45)));
        g.fillRect(0, 0, w, h);
    }

    private void drawHeroFinale(Graphics2D g, int w, int h, BufferedImage cutout) {
        int cx = w / 2;
        int bodyTop = (int) (h * 0.38);
        int bodyH = (int) (h * 0.42);

        // Dark body silhouette
        g.setColor(new Color(4, 6, 12));
        g.fillRoundRect(cx - (int) (w * 0.14), bodyTop, (int) (w * 0.28), bodyH, 40, 40);
        g.setColor(new Color(0, 0, 0, 180));
        g.fillRoundRect(cx - (int) (w * 0.12), bodyTop + 20, (int) (w * 0.24), bodyH - 40, 30, 30);

        if (cutout != null) {
            BufferedImage face = extractFacePlate(cutout);
            if (face != null) {
                int faceW = (int) (w * 0.38);
                double scale = (double) faceW / face.getWidth();
                int faceH = (int) Math.round(face.getHeight() * scale);
                int fx = cx - faceW / 2;
                int fy = (int) (h * 0.14);
                g.setComposite(AlphaComposite.SrcOver);
                g.drawImage(face, fx, fy, faceW, faceH, null);

                // Rim light on face
                g.setPaint(new GradientPaint(fx, fy, new Color(0, 255, 255, 60),
                    fx + faceW, fy + faceH, new Color(255, 0, 180, 50)));
                g.setComposite(AlphaComposite.SrcAtop);
                g.fillRect(fx, fy, faceW, faceH);
                g.setComposite(AlphaComposite.SrcOver);
            }
        }

        g.setPaint(new GradientPaint(cx - 80, bodyTop - 60, new Color(0, 255, 255, 80),
            cx + 80, bodyTop + bodyH, new Color(255, 0, 160, 60)));
        g.setStroke(new BasicStroke(4f));
        g.drawRoundRect(cx - (int) (w * 0.14), bodyTop, (int) (w * 0.28), bodyH, 40, 40);
    }

    private void drawComboFrame(Graphics2D g, int w, int h, BufferedImage cutout, int frameIndex, int frameCount) {
        int phase = frameIndex % 3;
        String pose = switch (phase) {
            case 0 -> "kick";
            case 1 -> "elbow";
            default -> "dodge";
        };
        drawCharacterPose(g, w, h, cutout, pose, "center", 0.90);
        // Motion streak
        g.setColor(new Color(0, 255, 255, 30 + (frameIndex * 7) % 40));
        g.setStroke(new BasicStroke(6f));
        int streakY = (int) (h * 0.55);
        g.drawLine((int) (w * 0.15), streakY, (int) (w * 0.85), streakY - 30 + phase * 20);
    }

    private void drawCharacterPose(
        Graphics2D g, int w, int h, BufferedImage cutout,
        String pose, String placement, double scaleFactor
    ) {
        if (cutout == null) {
            drawFallbackSilhouette(g, w, h, pose, placement);
            return;
        }

        double baseScale = Math.min((w * 0.52) / cutout.getWidth(), (h * 0.58) / cutout.getHeight()) * scaleFactor;
        int cw = (int) Math.round(cutout.getWidth() * baseScale);
        int ch = (int) Math.round(cutout.getHeight() * baseScale);
        int cy = (int) (h * 0.48) - ch / 2;
        int cx = resolveX(w, cw, placement);

        AffineTransform at = new AffineTransform();
        at.translate(cx + cw / 2.0, cy + ch / 2.0);
        applyPoseTransform(at, pose);
        at.scale(baseScale, baseScale);
        at.translate(-cutout.getWidth() / 2.0, -cutout.getHeight() / 2.0);

        Graphics2D g2 = (Graphics2D) g.create();
        g2.setTransform(at);

        if ("back".equals(pose)) {
            g2.setComposite(AlphaComposite.SrcOver);
            BufferedImage dark = darkenSilhouette(cutout);
            g2.drawImage(dark, 0, 0, null);
        } else if ("kick".equals(pose) || "elbow".equals(pose)) {
            g2.drawImage(cutout, 0, 0, null);
            drawMartialExtension(g2, cutout.getWidth(), cutout.getHeight(), pose);
        } else {
            g2.drawImage(cutout, 0, 0, null);
        }
        g2.dispose();
    }

    private void applyPoseTransform(AffineTransform at, String pose) {
        switch (String.valueOf(pose).toLowerCase(Locale.ROOT)) {
            case "back" -> at.scale(-1, 1);
            case "dodge" -> at.rotate(Math.toRadians(-18));
            case "kick" -> at.rotate(Math.toRadians(8));
            case "elbow" -> at.rotate(Math.toRadians(-6));
            case "hero" -> { /* upright */ }
            default -> { /* idle */ }
        }
    }

    private void drawMartialExtension(Graphics2D g, int cw, int ch, String pose) {
        g.setStroke(new BasicStroke(Math.max(8, cw / 24f), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND));
        if ("kick".equals(pose)) {
            g.setColor(new Color(220, 230, 245));
            g.drawLine((int) (cw * 0.55), (int) (ch * 0.72), (int) (cw * 0.95), (int) (ch * 0.55));
            g.setColor(new Color(0, 255, 255, 120));
            g.drawLine((int) (cw * 0.58), (int) (ch * 0.74), (int) (cw * 1.05), (int) (ch * 0.52));
        } else if ("elbow".equals(pose)) {
            g.setColor(new Color(220, 230, 245));
            g.drawLine((int) (cw * 0.35), (int) (ch * 0.42), (int) (cw * 0.08), (int) (ch * 0.38));
            g.setColor(new Color(255, 0, 160, 100));
            g.drawLine((int) (cw * 0.32), (int) (ch * 0.40), (int) (cw * 0.02), (int) (ch * 0.35));
        }
    }

    private BufferedImage darkenSilhouette(BufferedImage src) {
        BufferedImage out = new BufferedImage(src.getWidth(), src.getHeight(), BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = out.createGraphics();
        g.drawImage(src, 0, 0, null);
        g.setComposite(AlphaComposite.SrcAtop);
        g.setColor(new Color(8, 10, 18, 210));
        g.fillRect(0, 0, src.getWidth(), src.getHeight());
        g.dispose();
        return out;
    }

    private void drawFallbackSilhouette(Graphics2D g, int w, int h, String pose, String placement) {
        int sw = (int) (w * 0.22);
        int sh = (int) (h * 0.42);
        int cx = resolveX(w, sw, placement);
        int cy = (int) (h * 0.38);
        g.setColor(new Color(6, 8, 16));
        g.fillRoundRect(cx, cy, sw, sh, 24, 24);
        g.setColor(new Color(0, 255, 255, 60));
        g.setStroke(new BasicStroke(3f));
        g.drawRoundRect(cx, cy, sw, sh, 24, 24);
    }

    private void drawEnemySilhouettes(Graphics2D g, int w, int h, int count, double yRatio) {
        int baseY = (int) (h * yRatio);
        for (int i = 0; i < count; i++) {
            int ew = (int) (w * 0.16);
            int eh = (int) (h * 0.28);
            int ex = (int) (w * 0.62 + i * w * 0.18);
            g.setColor(new Color(255, 40, 60, 140));
            g.fillRoundRect(ex, baseY - eh, ew, eh, 20, 20);
            g.setColor(new Color(255, 80, 100, 80));
            g.setStroke(new BasicStroke(2f));
            g.drawRoundRect(ex, baseY - eh, ew, eh, 20, 20);
        }
    }

    private int resolveX(int w, int charW, String placement) {
        String p = String.valueOf(placement).toLowerCase(Locale.ROOT);
        int margin = (int) (w * 0.08);
        if (p.contains("left")) return margin;
        if (p.contains("right")) return w - margin - charW;
        return (w - charW) / 2;
    }

    private void paintVignette(Graphics2D g, int w, int h) {
        g.setPaint(new GradientPaint(0, 0, new Color(0, 0, 0, 120), w / 2f, h / 2f, new Color(0, 0, 0, 0)));
        g.fillRect(0, 0, w, h / 3);
        g.setPaint(new GradientPaint(0, h, new Color(0, 0, 0, 160), w / 2f, h * 0.65f, new Color(0, 0, 0, 0)));
        g.fillRect(0, (int) (h * 0.55), w, (int) (h * 0.45));
    }

    private void drawCaption(Graphics2D g, int w, int h, String caption, int sceneIndex) {
        if (caption == null || caption.isBlank()) return;
        int bandH = (int) (h * 0.14);
        int bandY = h - bandH;
        g.setPaint(new GradientPaint(0, bandY, new Color(0, 0, 0, 0), 0, h, new Color(0, 0, 0, 200)));
        g.fillRect(0, bandY - 20, w, bandH + 20);

        g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, Math.max(22, w / 38)));
        g.setColor(new Color(250, 250, 252));
        FontMetrics fm = g.getFontMetrics();
        String text = caption.length() > 80 ? caption.substring(0, 77) + "..." : caption;
        int tx = (w - fm.stringWidth(text)) / 2;
        int ty = h - bandH / 2 + fm.getAscent() / 2 - 4;
        g.drawString(text, tx, ty);

        g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, Math.max(14, w / 64)));
        g.setColor(new Color(0, 255, 255, 180));
        g.drawString("SCENE " + sceneIndex, (int) (w * 0.06), ty);
    }
}
